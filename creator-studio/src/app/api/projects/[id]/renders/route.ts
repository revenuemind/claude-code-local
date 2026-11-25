import { api } from '@/lib/server/api';
import { listRenders, requestRender } from '@/lib/services/generation';

type P = { id: string };
export const GET = api<P>(async ({ db, actor, params }) => ({ renders: await listRenders(db, actor, params.id) }));
export const POST = api<P>(async ({ db, actor, params, body }) => requestRender(db, actor, params.id, body), { limit: { name: 'render', max: 20, windowMs: 60_000 } });
