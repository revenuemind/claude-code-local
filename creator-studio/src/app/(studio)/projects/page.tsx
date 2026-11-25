import { getDb } from '@/lib/db/client';
import { requireActor } from '@/lib/server/session';
import { listProjects } from '@/lib/services/projects';
import { ProjectList } from '@/components/pages/ProjectList';

export default async function ProjectsPage() {
  const actor = await requireActor();
  const projects = await listProjects(await getDb(), actor);
  return <ProjectList projects={projects.map((p) => ({ id: p.id, name: p.name, status: p.status, type: p.type, templateId: p.templateId, updatedAt: p.updatedAt.toISOString(), aspect: p.settings.aspect, language: p.settings.language, mode: p.productionMode }))} />;
}
