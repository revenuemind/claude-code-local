import { getDb } from '@/lib/db/client';
import { requireActor } from '@/lib/server/session';
import { listTemplates } from '@/lib/services/templates';
import { TemplateLibrary } from '@/components/templates/TemplateLibrary';

export default async function TemplatesPage() {
  const actor = await requireActor();
  const templates = await listTemplates(await getDb(), actor);
  return <TemplateLibrary initial={templates} />;
}
