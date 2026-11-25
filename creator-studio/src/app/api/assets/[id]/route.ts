import { api } from '@/lib/server/api';
import { getAsset, deleteAsset } from '@/lib/services/assets';
import { assertCan } from '@/lib/services/context';

type P = { id: string };
export const GET = api<P>(async ({ db, actor, params }) => { assertCan(actor, 'asset.read'); return { asset: await getAsset(db, actor.orgId, params.id) }; });
export const DELETE = api<P>(async ({ db, actor, params }) => { await deleteAsset(db, actor, params.id); return { ok: true }; });
