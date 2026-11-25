import { api } from '@/lib/server/api';
import { listProjects, createProject } from '@/lib/services/projects';

export const GET = api(async ({ db, actor, req }) => {
  const sp = req.nextUrl.searchParams;
  return { projects: await listProjects(db, actor, { workspaceId: sp.get('workspaceId') ?? undefined, brandId: sp.get('brandId') ?? undefined, status: sp.get('status') ?? undefined }) };
});
export const POST = api(async ({ db, actor, body }) => ({ project: await createProject(db, actor, body) }));
