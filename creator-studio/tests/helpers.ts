import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb, type DB } from '../src/lib/db/client';
import { ensureSeed } from '../src/lib/db/seed';
import { LocalStorage, setStorageForTests } from '../src/lib/storage';
import { register, resolveSession, createSession } from '../src/lib/services/auth';
import type { Actor } from '../src/lib/services/context';

export async function testDb(): Promise<{ db: DB; close: () => Promise<void>; dir: string }> {
  const h = await createDb('memory://', { migrate: true });
  await ensureSeed(h.db);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-test-'));
  setStorageForTests(new LocalStorage(dir));
  return { db: h.db, close: async () => { await h.close(); fs.rmSync(dir, { recursive: true, force: true }); }, dir };
}

let n = 0;
export async function testActor(db: DB, opts: { email?: string; name?: string } = {}): Promise<Actor> {
  n++;
  const email = opts.email ?? `user${n}-${Date.now()}@example.test`;
  const { user, org } = await register(db, { name: opts.name ?? `User ${n}`, email, password: 'correct horse battery staple' });
  const token = await createSession(db, user.id, org.id);
  const actor = await resolveSession(db, token);
  if (!actor) throw new Error('session did not resolve');
  return actor;
}
