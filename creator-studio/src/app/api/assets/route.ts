import { api } from '@/lib/server/api';
import { listAssets, uploadAsset } from '@/lib/services/assets';
import { badRequest } from '@/lib/services/context';

export const GET = api(async ({ db, actor, req }) => {
  const sp = req.nextUrl.searchParams;
  return { assets: await listAssets(db, actor, { projectId: sp.get('projectId') ?? undefined, kind: sp.get('kind') ?? undefined }) };
});
export const POST = api(async ({ db, actor, req }) => {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw badRequest('Missing file');
  const projectId = (form.get('projectId') as string | null) || null;
  const brandId = (form.get('brandId') as string | null) || null;
  if (projectId) { const { getProject } = await import('@/lib/services/projects'); await getProject(db, actor, projectId); }
  if (brandId) { const { getBrand } = await import('@/lib/services/brands'); await getBrand(db, actor.orgId, brandId); }
  const asset = await uploadAsset(db, actor, { name: file.name, data: Buffer.from(await file.arrayBuffer()) }, { projectId, brandId });
  return { asset };
}, { rawBody: true, limit: { name: 'upload', max: 120, windowMs: 60 * 60_000 } });
