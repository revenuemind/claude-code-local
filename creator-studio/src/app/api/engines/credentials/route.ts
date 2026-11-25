import { api } from '@/lib/server/api';
import { saveCredential } from '@/lib/services/engines';

export const POST = api(async ({ db, actor, body }) => ({ credential: await saveCredential(db, actor, body) }), { limit: { name: 'cred', max: 30, windowMs: 60_000 } });
