import { api } from '@/lib/server/api';
import { listBrands, createBrand } from '@/lib/services/brands';

export const GET = api(async ({ db, actor }) => ({ brands: await listBrands(db, actor) }));
export const POST = api(async ({ db, actor, body }) => ({ brand: await createBrand(db, actor, body) }));
