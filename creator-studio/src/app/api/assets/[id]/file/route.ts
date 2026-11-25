import { api } from '@/lib/server/api';
import { getAsset } from '@/lib/services/assets';
import { assertCan } from '@/lib/services/context';
import { streamAsset } from '@/lib/server/stream';

export const GET = api<{ id: string }>(async ({ db, actor, params, req }) => {
  assertCan(actor, 'asset.read');
  const a = await getAsset(db, actor.orgId, params.id);
  return streamAsset(a, req);
});
