import { api } from '@/lib/server/api';
import { requestAllMissing } from '@/lib/services/generation';

export const POST = api<{ id: string }>(async ({ db, actor, params }) => ({ requests: await requestAllMissing(db, actor, params.id) }), { limit: { name: 'gen-all', max: 10, windowMs: 60_000 } });
