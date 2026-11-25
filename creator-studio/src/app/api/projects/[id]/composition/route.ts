import { api } from '@/lib/server/api';
import { z } from 'zod';
import { saveComposition } from '@/lib/services/projects';

export const PUT = api<{ id: string }>(async ({ db, actor, params, body }) => {
  const b = z.object({ composition: z.unknown(), revision: z.number().int() }).parse(body);
  const p = await saveComposition(db, actor, params.id, b.composition, b.revision);
  return { revision: p.compositionRevision, durationMs: p.composition?.durationMs };
});
