import { api } from '@/lib/server/api';
import { disconnectAccount } from '@/lib/services/publishing';

export const DELETE = api<{ id: string }>(async ({ db, actor, params }) => { await disconnectAccount(db, actor, params.id); return { ok: true }; });
