import { api } from '@/lib/server/api';
import { requestMusic } from '@/lib/services/generation';

export const POST = api<{ id: string }>(async ({ db, actor, params, body }) => ({ job: await requestMusic(db, actor, params.id, body) }));
