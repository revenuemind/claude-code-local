/**
 * Durable job queue on PostgreSQL. Workers claim jobs with
 * `SELECT … FOR UPDATE SKIP LOCKED`, so any number of worker processes can run
 * safely. Failed jobs retry with exponential backoff when the error is
 * retryable; stale locks (crashed workers) are re-queued.
 */
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { jobs } from '../db/schema';
import { assertCan, badRequest, notFound, type Actor } from '../services/context';

export const JOB_TYPES = ['plan.generate', 'asset.image', 'asset.video', 'asset.voice', 'asset.music', 'render.video', 'publish.post'] as const;
export type JobType = (typeof JOB_TYPES)[number];
export type JobRow = typeof jobs.$inferSelect;

export interface EnqueueInput {
  orgId: string; type: JobType; payload: Record<string, unknown>;
  projectId?: string | null; sceneId?: string | null; createdBy?: string | null;
  providerId?: string | null; modelId?: string | null; maxAttempts?: number; priority?: number; runAt?: Date;
}

export async function enqueue(db: DB, input: EnqueueInput): Promise<JobRow> {
  const [row] = await db.insert(jobs).values({
    orgId: input.orgId, type: input.type, payload: input.payload, projectId: input.projectId ?? null, sceneId: input.sceneId ?? null,
    createdBy: input.createdBy ?? null, providerId: input.providerId ?? null, modelId: input.modelId ?? null,
    maxAttempts: input.maxAttempts ?? 3, priority: input.priority ?? 0, runAt: input.runAt ?? new Date(),
  }).returning();
  return row;
}

export async function claimNext(db: DB, workerId: string, types?: readonly string[]): Promise<JobRow | null> {
  return db.transaction(async (tx) => {
    const conds = [eq(jobs.status, 'queued'), sql`${jobs.runAt} <= now()`];
    if (types?.length) conds.push(inArray(jobs.type, [...types]));
    const [next] = await tx.select({ id: jobs.id }).from(jobs).where(and(...conds))
      .orderBy(desc(jobs.priority), jobs.runAt).limit(1).for('update', { skipLocked: true });
    if (!next) return null;
    const [claimed] = await tx.update(jobs).set({
      status: 'running', lockedAt: new Date(), lockedBy: workerId, attempts: sql`${jobs.attempts} + 1`, updatedAt: new Date(), error: null,
    }).where(eq(jobs.id, next.id)).returning();
    return claimed;
  });
}

export async function complete(db: DB, id: string, result: Record<string, unknown>) {
  await db.update(jobs).set({ status: 'succeeded', result, progress: 1, lockedAt: null, lockedBy: null, finishedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(jobs.id, id), eq(jobs.status, 'running')));
}

export function backoffMs(attempt: number): number {
  return Math.min(10 * 60_000, 5_000 * 2 ** Math.max(0, attempt - 1));
}

export async function fail(db: DB, job: JobRow, err: unknown, partialResult?: Record<string, unknown> | null) {
  const e = err as Error & { retryable?: boolean };
  const retryable = e?.retryable !== false && !(e?.name === 'AppError' || e?.name === 'ZodError');
  const message = (e?.message ?? String(err)).slice(0, 2000);
  if (retryable && job.attempts < job.maxAttempts) {
    await db.update(jobs).set({
      status: 'queued', error: message, lockedAt: null, lockedBy: null, runAt: new Date(Date.now() + backoffMs(job.attempts)), updatedAt: new Date(),
      ...(partialResult ? { result: partialResult } : {}),
    }).where(and(eq(jobs.id, job.id), eq(jobs.status, 'running')));
    return 'retry' as const;
  }
  await db.update(jobs).set({ status: 'failed', error: message, lockedAt: null, lockedBy: null, finishedAt: new Date(), updatedAt: new Date(), ...(partialResult ? { result: partialResult } : {}) })
    .where(and(eq(jobs.id, job.id), eq(jobs.status, 'running')));
  return 'failed' as const;
}

export async function setProgress(db: DB, id: string, progress: number, result?: Record<string, unknown>) {
  await db.update(jobs).set({ progress: Math.max(0, Math.min(1, progress)), lockedAt: new Date(), updatedAt: new Date(), ...(result ? { result } : {}) }).where(eq(jobs.id, id));
}

export async function getJobStatus(db: DB, id: string): Promise<string | null> {
  const [r] = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, id)).limit(1);
  return r?.status ?? null;
}

/** Re-queue jobs whose worker stopped heart-beating (crash / restart). */
export async function reapStale(db: DB, staleMs = 10 * 60_000): Promise<number> {
  const rows = await db.update(jobs).set({ status: 'queued', lockedAt: null, lockedBy: null, updatedAt: new Date(), error: 'worker lost; re-queued' })
    .where(and(eq(jobs.status, 'running'), lt(jobs.lockedAt, new Date(Date.now() - staleMs)))).returning({ id: jobs.id });
  return rows.length;
}

// ───────────────────────── Actor-facing operations ─────────────────────────

export async function listJobs(db: DB, actor: Actor, filter: { projectId?: string; status?: string; limit?: number } = {}) {
  assertCan(actor, 'project.read');
  const conds = [eq(jobs.orgId, actor.orgId)];
  if (filter.projectId) conds.push(eq(jobs.projectId, filter.projectId));
  if (filter.status) conds.push(eq(jobs.status, filter.status));
  return db.select().from(jobs).where(and(...conds)).orderBy(desc(jobs.createdAt)).limit(Math.min(500, filter.limit ?? 100));
}

export async function getJob(db: DB, actor: Actor, id: string) {
  const [j] = await db.select().from(jobs).where(and(eq(jobs.id, id), eq(jobs.orgId, actor.orgId))).limit(1);
  if (!j) throw notFound('Job');
  return j;
}

export async function cancelJob(db: DB, actor: Actor, id: string) {
  assertCan(actor, 'generate');
  const j = await getJob(db, actor, id);
  if (j.status !== 'queued' && j.status !== 'running') throw badRequest(`Job is already ${j.status}`);
  await db.update(jobs).set({ status: 'canceled', finishedAt: new Date(), updatedAt: new Date(), lockedAt: null }).where(eq(jobs.id, id));
}

export async function retryJob(db: DB, actor: Actor, id: string) {
  assertCan(actor, 'generate');
  const j = await getJob(db, actor, id);
  if (j.status !== 'failed' && j.status !== 'canceled') throw badRequest('Only failed or canceled jobs can be retried');
  const [row] = await db.update(jobs).set({ status: 'queued', attempts: 0, error: null, runAt: new Date(), finishedAt: null, updatedAt: new Date() }).where(eq(jobs.id, id)).returning();
  return row;
}
