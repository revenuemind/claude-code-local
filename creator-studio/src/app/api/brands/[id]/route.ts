import { api } from '@/lib/server/api';
import { getBrand, updateBrand, deleteBrand } from '@/lib/services/brands';
import { assertCan } from '@/lib/services/context';

type P = { id: string };
export const GET = api<P>(async ({ db, actor, params }) => { assertCan(actor, 'brand.read'); return { brand: await getBrand(db, actor.orgId, params.id) }; });
export const PATCH = api<P>(async ({ db, actor, params, body }) => ({ brand: await updateBrand(db, actor, params.id, body) }));
export const DELETE = api<P>(async ({ db, actor, params }) => { await deleteBrand(db, actor, params.id); return { ok: true }; });
