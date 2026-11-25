import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { requireActor } from '@/lib/server/session';
import { getProject } from '@/lib/services/projects';
import { getTemplate } from '@/lib/services/templates';
import { ProjectWorkspace } from '@/components/project/ProjectWorkspace';
import { can } from '@/lib/auth/rbac';

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ stage?: string }> }) {
  const actor = await requireActor();
  const db = await getDb();
  const { id } = await params;
  const sp = await searchParams;
  const project = await getProject(db, actor, id).catch(() => null);
  if (!project) notFound();
  const template = project.templateId ? await getTemplate(db, actor.orgId, project.templateId).catch(() => null) : null;
  return (
    <ProjectWorkspace
      initial={JSON.parse(JSON.stringify(project))}
      template={template}
      stage={sp.stage ?? 'overview'}
      perms={{ write: can(actor.role, 'project.write'), generate: can(actor.role, 'generate'), render: can(actor.role, 'render'), publish: can(actor.role, 'publish'), del: can(actor.role, 'project.delete') }}
    />
  );
}
