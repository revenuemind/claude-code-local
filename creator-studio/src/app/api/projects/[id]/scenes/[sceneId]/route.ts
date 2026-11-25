import { api } from '@/lib/server/api';
import { z } from 'zod';
import { setSceneMediaMode } from '@/lib/services/projects';

export const PATCH = api<{ id: string; sceneId: string }>(async ({ db, actor, params, body }) => {
  const { mediaMode } = z.object({ mediaMode: z.enum(['code', 'ai-image', 'ai-video', 'upload', 'avatar']) }).parse(body);
  return { project: await setSceneMediaMode(db, actor, params.id, params.sceneId, mediaMode) };
});
