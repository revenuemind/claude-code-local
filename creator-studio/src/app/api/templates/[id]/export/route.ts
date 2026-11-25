import { api } from '@/lib/server/api';
import { getTemplate, exportTemplate } from '@/lib/services/templates';

export const GET = api<{ id: string }>(async ({ db, actor, params }) => {
  const t = await getTemplate(db, actor.orgId, params.id);
  return new Response(exportTemplate(t), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="template-${t.id}.json"` } });
});
