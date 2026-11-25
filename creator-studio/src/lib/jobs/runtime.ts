/** Starts a worker inside the current process (dev / single-node) or as a standalone process (production). */
import type { DB } from '../db/client';
import { Worker } from './worker';
import { writeHeartbeat } from '../services/admin';

const g = globalThis as unknown as { __csWorker?: Worker; __csHeartbeat?: NodeJS.Timeout };

export function startWorker(db: DB, opts: { concurrency?: number; log?: (m: string) => void } = {}): Worker {
  if (g.__csWorker) return g.__csWorker;
  const w = new Worker(db, { concurrency: opts.concurrency ?? Number(process.env.WORKER_CONCURRENCY ?? 2), pollMs: Number(process.env.WORKER_POLL_MS ?? 1000), log: opts.log ?? ((m) => console.log(`[worker] ${m}`)) });
  w.start();
  const beat = () => writeHeartbeat(db, w.id, w.busy).catch(() => {});
  void beat();
  g.__csHeartbeat = setInterval(beat, 15_000);
  g.__csWorker = w;
  return w;
}

export async function stopWorker() {
  if (g.__csHeartbeat) clearInterval(g.__csHeartbeat);
  await g.__csWorker?.stop();
  g.__csWorker = undefined;
}
