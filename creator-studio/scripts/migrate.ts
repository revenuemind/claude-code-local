/** Apply database migrations and baseline seed data: `npm run db:migrate`. */
import { createDb } from '../src/lib/db/client';
import { ensureSeed } from '../src/lib/db/seed';

async function main() {
  const h = await createDb(process.env.DATABASE_URL, { migrate: true });
  await ensureSeed(h.db);
  console.log(`migrated (${h.kind})`);
  await h.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
