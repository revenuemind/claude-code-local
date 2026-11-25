import { getDb } from '@/lib/db/client';
import { requireActor } from '@/lib/server/session';
import { getTemplate } from '@/lib/services/templates';
import { TemplateEditor, BLANK_TEMPLATE } from '@/components/templates/TemplateEditor';

export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const a = await requireActor();
  const sp = await searchParams;
  const base = sp.from ? await getTemplate(await getDb(), a.orgId, sp.from).catch(() => null) : null;
  return <TemplateEditor initial={base ? { ...base, id: `${base.id}-custom` } : BLANK_TEMPLATE} templateId={null} />;
}
