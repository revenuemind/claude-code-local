import { api } from '@/lib/server/api';
import { requestPlan } from '@/lib/services/generation';

export const POST = api<{ id: string }>(async ({ db, actor, params, body }) => ({ job: await requestPlan(db, actor, params.id, body) }), { limit: { name: 'gen-plan', max: 30, windowMs: 60_000 } });
