import { api } from '@/lib/server/api';
import { cancelPublication } from '@/lib/services/publishing';

export const POST = api<{ id: string }>(async ({ db, actor, params }) => { await cancelPublication(db, actor, params.id); return { ok: true }; });
