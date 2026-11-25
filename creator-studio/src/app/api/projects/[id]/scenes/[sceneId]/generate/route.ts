import { api } from '@/lib/server/api';
import { requestSceneMedia } from '@/lib/services/generation';

export const POST = api<{ id: string; sceneId: string }>(async ({ db, actor, params, body }) => {
  const b = (body ?? {}) as Record<string, unknown>;
  const kind = b.kind === 'video' ? 'video' : 'image';
  return requestSceneMedia(db, actor, params.id, kind, { ...b, sceneId: params.sceneId, kind: undefined });
}, { limit: { name: 'gen-media', max: 60, windowMs: 60_000 } });
