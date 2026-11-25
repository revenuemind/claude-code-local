import { getDb } from '@/lib/db/client';
import { requireActor } from '@/lib/server/session';
import { listTemplates } from '@/lib/services/templates';
import { listBrands, toBrandKit } from '@/lib/services/brands';
import { NewProjectWizard } from '@/components/pages/NewProjectWizard';

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const actor = await requireActor();
  const db = await getDb();
  const [templates, brands, sp] = await Promise.all([listTemplates(db, actor), listBrands(db, actor), searchParams]);
  return <NewProjectWizard templates={templates} brands={brands.map((b) => ({ id: b.id, kit: toBrandKit(b), languages: b.preferredLanguages }))} initialTemplateId={sp.template ?? null} />;
}
