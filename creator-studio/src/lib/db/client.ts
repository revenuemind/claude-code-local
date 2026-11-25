/**
 * Database client. DATABASE_URL=postgres://… uses node-postgres (production);
 * otherwise an embedded PGlite (PostgreSQL compiled to WASM) is used for
 * zero-setup local development and tests. Both speak the same SQL dialect, so
 * the schema, migrations and queries are identical.
 */
import path from 'node:path';
import fs from 'node:fs';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

interface DbHandle { db: DB; kind: 'postgres' | 'pglite'; close: () => Promise<void> }

const g = globalThis as unknown as { __csDb?: Promise<DbHandle> };

const MIGRATIONS = path.resolve(process.cwd(), 'drizzle');

export async function createDb(url = process.env.DATABASE_URL, opts: { migrate?: boolean } = {}): Promise<DbHandle> {
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const pool = new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
    const db = drizzle(pool, { schema }) as unknown as DB;
    if (opts.migrate) {
      const { migrate } = await import('drizzle-orm/node-postgres/migrator');
      await migrate(db as never, { migrationsFolder: MIGRATIONS });
    }
    return { db, kind: 'postgres', close: () => pool.end() };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const dir = url?.startsWith('memory://') ? undefined : (url?.replace(/^pglite:\/\//, '') || process.env.PGLITE_DIR || path.resolve(process.cwd(), 'data/pglite'));
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const client = dir ? new PGlite(dir) : new PGlite();
  const db = drizzle(client, { schema }) as unknown as DB;
  if (opts.migrate ?? true) {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(db as never, { migrationsFolder: MIGRATIONS });
  }
  return { db, kind: 'pglite', close: () => client.close() };
}

/** Process-wide singleton (survives Next.js dev hot reloads). */
export function getDbHandle(): Promise<DbHandle> {
  if (!g.__csDb) {
    const autoMigrate = process.env.DB_AUTO_MIGRATE !== 'false';
    g.__csDb = createDb(process.env.DATABASE_URL, { migrate: autoMigrate }).then(async (h) => {
      const { ensureSeed } = await import('./seed');
      await ensureSeed(h.db);
      return h;
    });
    g.__csDb.catch(() => { g.__csDb = undefined; });
  }
  return g.__csDb;
}

export async function getDb(): Promise<DB> {
  return (await getDbHandle()).db;
}

/** Test helper: replace the singleton (e.g. with an in-memory PGlite). */
export function setDbHandleForTests(h: Promise<DbHandle> | undefined) {
  g.__csDb = h;
}

export { schema };
