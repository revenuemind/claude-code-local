import { api } from '@/lib/server/api';
import { z } from 'zod';
import { suggestCaption } from '@/lib/services/publishing';

export const POST = api(async ({ db, actor, body }) => {
  const b = z.object({ projectId: z.string(), platform: z.enum(['youtube', 'tiktok', 'instagram', 'facebook', 'blotato', 'manual']) }).parse(body);
  return suggestCaption(db, actor, b.projectId, b.platform);
});
