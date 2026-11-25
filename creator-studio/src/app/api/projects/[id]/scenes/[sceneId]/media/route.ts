import { api } from '@/lib/server/api';
import { z } from 'zod';
import { assignSceneMedia } from '@/lib/services/projects';

export const POST = api<{ id: string; sceneId: string }>(async ({ db, actor, params, body }) => {
  const { assetId } = z.object({ assetId: z.string().max(100).nullable() }).parse(body);
  return { project: await assignSceneMedia(db, actor, params.id, params.sceneId, assetId) };
});
