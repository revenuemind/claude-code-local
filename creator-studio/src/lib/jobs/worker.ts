/** Job worker: polls the queue, runs handlers with cancellation + progress, retries on failure. */
import os from 'node:os';
import type { DB } from '../db/client';
import { claimNext, complete, fail, getJobStatus, reapStale, setProgress, type JobRow } from './queue';
import { HANDLERS, type JobContext } from './handlers';

export interface WorkerOptions { concurrency?: number; pollMs?: number; types?: readonly string[]; log?: (msg: string) => void }

export class Worker {
  readonly id = `${os.hostname()}:${process.pid}:${Math.random().toString(36).slice(2, 7)}`;
  private running = new Map<string, AbortController>();
  private timer: NodeJS.Timeout | null = null;
  private stopped = true;
  private lastReap = 0;
  constructor(private db: DB, private opts: WorkerOptions = {}) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    const loop = async () => {
      if (this.stopped) return;
      try { await this.tick(); } catch (e) { this.opts.log?.(`worker tick error: ${(e as Error).message}`); }
      this.timer = setTimeout(loop, this.opts.pollMs ?? 1000);
    };
    void loop();
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    for (const ac of this.running.values()) ac.abort();
  }

  get busy() { return this.running.size; }

  /** Claim and start as many jobs as capacity allows. Returns the started jobs' promises (for tests). */
  async tick(): Promise<Promise<void>[]> {
    if (Date.now() - this.lastReap > 60_000) { this.lastReap = Date.now(); await reapStale(this.db).catch(() => 0); }
    const started: Promise<void>[] = [];
    const cap = this.opts.concurrency ?? 2;
    while (this.running.size < cap) {
      const job = await claimNext(this.db, this.id, this.opts.types);
      if (!job) break;
      started.push(this.run(job));
    }
    return started;
  }

  /** Run jobs until the queue is empty (tests / CLI). */
  async drain(maxJobs = 100) {
    for (let i = 0; i < maxJobs; i++) {
      const started = await this.tick();
      if (!started.length && this.running.size === 0) return;
      await Promise.all(started);
    }
  }

  private async run(job: JobRow) {
    const ac = new AbortController();
    this.running.set(job.id, ac);
    const watch = setInterval(async () => {
      const s = await getJobStatus(this.db, job.id).catch(() => null);
      if (s === 'canceled') ac.abort();
    }, 2000);
    let partial: Record<string, unknown> | null = (job.result as Record<string, unknown>) ?? null;
    const ctx: JobContext = {
      db: this.db, job, signal: ac.signal,
      progress: async (p, result) => { if (result) partial = { ...(partial ?? {}), ...result }; await setProgress(this.db, job.id, p, partial ?? undefined); },
      log: (m) => this.opts.log?.(`[${job.type} ${job.id.slice(0, 8)}] ${m}`),
    };
    try {
      const handler = HANDLERS[job.type as keyof typeof HANDLERS];
      if (!handler) throw Object.assign(new Error(`No handler for job type ${job.type}`), { retryable: false });
      const result = await handler(ctx);
      if (ac.signal.aborted) return;
      await complete(this.db, job.id, { ...(partial ?? {}), ...result });
      ctx.log('succeeded');
    } catch (e) {
      if ((await getJobStatus(this.db, job.id)) === 'canceled') return;
      const outcome = await fail(this.db, job, e, partial);
      ctx.log(`${outcome}: ${(e as Error).message}`);
    } finally {
      clearInterval(watch);
      this.running.delete(job.id);
    }
  }
}
