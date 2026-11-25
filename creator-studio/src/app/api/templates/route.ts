import { api } from '@/lib/server/api';
import { listTemplates, saveCustomTemplate } from '@/lib/services/templates';
import { assertCanCreateTemplate } from '@/lib/services/usage';

export const GET = api(async ({ db, actor }) => ({ templates: await listTemplates(db, actor) }));
export const POST = api(async ({ db, actor, body }) => {
  await assertCanCreateTemplate(db, actor.orgId);
  const b = body as { definition: unknown; status?: 'draft' | 'published'; platform?: boolean; baseTemplateId?: string };
  return { template: await saveCustomTemplate(db, actor, b) };
});
