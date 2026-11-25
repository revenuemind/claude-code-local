import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { requireActor } from '@/lib/server/session';
import { getTemplate } from '@/lib/services/templates';
import { TemplateEditor } from '@/components/templates/TemplateEditor';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const a = await requireActor();
  const { id } = await params;
  const t = await getTemplate(await getDb(), a.orgId, id).catch(() => null);
  if (!t) notFound();
  return <TemplateEditor initial={t} templateId={t.custom ? t.id : null} />;
}
