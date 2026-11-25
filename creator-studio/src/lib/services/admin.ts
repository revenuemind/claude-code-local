/** Platform administration (platform admins only). */
import { count, desc, eq, sql } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import type { DB } from '../db/client';
import { users, organizations, memberships, projects, jobs, plans, subscriptions, appSettings, renders } from '../db/schema';
import { assertPlatformAdmin, badRequest, type Actor } from './context';
import { audit, listAudit } from './audit';
import { ffmpegAvailable } from '../media/ffmpeg';
import { storage } from '../storage';

export async function overview(db: DB, actor: Actor) {
  assertPlatformAdmin(actor);
  const [[u], [o], [p], [r]] = await Promise.all([
    db.select({ n: count() }).from(users), db.select({ n: count() }).from(organizations), db.select({ n: count() }).from(projects), db.select({ n: count() }).from(renders),
  ]);
  const jobStats = await db.select({ status: jobs.status, n: count() }).from(jobs).groupBy(jobs.status);
  return { users: Number(u.n), orgs: Number(o.n), projects: Number(p.n), renders: Number(r.n), jobs: Object.fromEntries(jobStats.map((j) => [j.status, Number(j.n)])) };
}

export async function listUsers(db: DB, actor: Actor) {
  assertPlatformAdmin(actor);
  return db.select({ id: users.id, email: users.email, name: users.name, isPlatformAdmin: users.isPlatformAdmin, disabled: users.disabled, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt })
    .from(users).orderBy(desc(users.createdAt)).limit(1000);
}

export async function updateUser(db: DB, actor: Actor, id: string, input: unknown) {
  assertPlatformAdmin(actor);
  const data = z.object({ disabled: z.boolean().optional(), isPlatformAdmin: z.boolean().optional() }).parse(input);
  if (id === actor.userId && (data.disabled || data.isPlatformAdmin === false)) throw badRequest('You cannot disable or demote yourself');
  await db.update(users).set(data).where(eq(users.id, id));
  await audit(db, actor, 'admin.user.update', { type: 'user', id }, data);
}

export async function listOrgs(db: DB, actor: Actor) {
  assertPlatformAdmin(actor);
  return db.select({
    id: organizations.id, name: organizations.name, slug: organizations.slug, planId: subscriptions.planId, createdAt: organizations.createdAt,
    members: sql<number>`(select count(*) from ${memberships} where ${memberships.orgId} = ${organizations.id})`,
    projects: sql<number>`(select count(*) from ${projects} where ${projects.orgId} = ${organizations.id})`,
  }).from(organizations).leftJoin(subscriptions, eq(subscriptions.orgId, organizations.id)).orderBy(desc(organizations.createdAt)).limit(1000);
}

export async function setOrgPlan(db: DB, actor: Actor, orgId: string, planId: string) {
  assertPlatformAdmin(actor);
  const [p] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!p) throw badRequest('Unknown plan');
  await db.insert(subscriptions).values({ orgId, planId, status: 'active' }).onConflictDoUpdate({ target: subscriptions.orgId, set: { planId } });
  await db.update(organizations).set({ planId }).where(eq(organizations.id, orgId));
  await audit(db, actor, 'admin.org.plan', { type: 'org', id: orgId }, { planId });
}

const limitsSchema = z.object({
  seats: z.number().int(), projects: z.number().int(), renderMinutesPerMonth: z.number(), maxRenderHeight: z.number().int(), storageMb: z.number(),
  aiCreditsUsdPerMonth: z.number(), scheduledPosts: z.number().int(), customTemplates: z.number().int(), watermark: z.boolean(),
});

export async function listPlans(db: DB) {
  return db.select().from(plans).orderBy(plans.sortOrder);
}

export async function upsertPlan(db: DB, actor: Actor, input: unknown) {
  assertPlatformAdmin(actor);
  const data = z.object({
    id: z.string().regex(/^[a-z0-9-]{2,40}$/), name: z.string().min(1).max(60), limits: limitsSchema, features: z.array(z.string().max(40)).max(40),
    billingPriceRef: z.string().max(200).nullable().optional(), active: z.boolean().default(true), sortOrder: z.number().int().default(0),
  }).parse(input);
  await db.insert(plans).values(data).onConflictDoUpdate({ target: plans.id, set: data });
  await audit(db, actor, 'admin.plan.upsert', { type: 'plan', id: data.id });
}

export async function allJobs(db: DB, actor: Actor, status?: string) {
  assertPlatformAdmin(actor);
  const q = db.select().from(jobs);
  return (status ? q.where(eq(jobs.status, status)) : q).orderBy(desc(jobs.createdAt)).limit(300);
}

export async function auditLog(db: DB, actor: Actor) {
  assertPlatformAdmin(actor);
  return listAudit(db, null, 300);
}

export async function writeHeartbeat(db: DB, workerId: string, busy: number) {
  const value = { at: new Date().toISOString(), workerId, busy };
  await db.insert(appSettings).values({ key: 'worker.heartbeat', scope: 'global', value }).onConflictDoUpdate({ target: [appSettings.key, appSettings.scope], set: { value } });
}

export async function health(db: DB) {
  const out: Record<string, { ok: boolean; detail?: string }> = {};
  try { await db.execute(sql`select 1`); out.database = { ok: true, detail: process.env.DATABASE_URL?.startsWith('postgres') ? 'postgres' : 'pglite (embedded)' }; } catch (e) { out.database = { ok: false, detail: (e as Error).message }; }
  out.ffmpeg = { ok: await ffmpegAvailable() };
  try {
    const key = `health/${os.hostname()}.txt`;
    await storage().put(key, Buffer.from(new Date().toISOString()), 'text/plain');
    await storage().delete(key);
    out.storage = { ok: true, detail: storage().kind };
  } catch (e) { out.storage = { ok: false, detail: (e as Error).message }; }
  const [hb] = await db.select().from(appSettings).where(eq(appSettings.key, 'worker.heartbeat')).limit(1);
  const at = hb ? new Date((hb.value as { at: string }).at) : null;
  out.worker = { ok: !!at && Date.now() - at.getTime() < 60_000, detail: at ? `last heartbeat ${at.toISOString()}` : 'no heartbeat yet' };
  out.fonts = { ok: fs.existsSync(path.resolve(process.cwd(), 'public/fonts/manifest.json')) };
  out.encryption = { ok: !!process.env.APP_ENCRYPTION_KEY || process.env.NODE_ENV !== 'production', detail: process.env.APP_ENCRYPTION_KEY ? 'configured' : 'development key' };
  return out;
}
