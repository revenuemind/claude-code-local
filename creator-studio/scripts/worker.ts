/** Standalone job worker (production): `npm run worker`. Scale horizontally by running more processes. */
import { createDb } from '../src/lib/db/client';
import { ensureSeed } from '../src/lib/db/seed';
import { startWorker, stopWorker } from '../src/lib/jobs/runtime';

async function main() {
  if (!process.env.DATABASE_URL?.startsWith('postgres')) {
    console.warn('[worker] DATABASE_URL is not PostgreSQL. The embedded database cannot be shared between processes — run the worker inside the web app instead (default).');
  }
  const h = await createDb(process.env.DATABASE_URL, { migrate: process.env.DB_AUTO_MIGRATE !== 'false' });
  await ensureSeed(h.db);
  const w = startWorker(h.db);
  console.log(`[worker] started ${w.id}`);
  const shutdown = async () => { console.log('[worker] shutting down'); await stopWorker(); await h.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
main().catch((e) => { console.error(e); process.exit(1); });
