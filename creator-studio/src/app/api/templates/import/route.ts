import { api } from '@/lib/server/api';
import { z } from 'zod';
import { importTemplate } from '@/lib/services/templates';
import { assertCanCreateTemplate } from '@/lib/services/usage';

export const POST = api(async ({ db, actor, body }) => {
  await assertCanCreateTemplate(db, actor.orgId);
  return { template: await importTemplate(db, actor, z.object({ json: z.string().max(500_000) }).parse(body).json) };
});
