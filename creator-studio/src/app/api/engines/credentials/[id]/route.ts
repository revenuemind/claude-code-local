import { api } from '@/lib/server/api';
import { deleteCredential } from '@/lib/services/engines';

export const DELETE = api<{ id: string }>(async ({ db, actor, params }) => { await deleteCredential(db, actor, params.id); return { ok: true }; });
