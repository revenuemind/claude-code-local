import { api } from '@/lib/server/api';
import { updateUser } from '@/lib/services/admin';

export const PATCH = api<{ id: string }>(async ({ db, actor, params, body }) => { await updateUser(db, actor, params.id, body); return { ok: true }; });
