/**
 * Next.js startup hook. With the embedded database (PGlite) the worker must run
 * in the web process; with PostgreSQL, run `npm run worker` separately and set
 * RUN_WORKER_IN_PROCESS=false on web instances.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.RUN_WORKER_IN_PROCESS === 'false') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { getDb } = await import('./lib/db/client');
  const { startWorker } = await import('./lib/jobs/runtime');
  startWorker(await getDb());
}
