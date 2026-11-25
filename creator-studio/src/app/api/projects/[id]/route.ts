import { api } from '@/lib/server/api';
import { getProject, updateProject, deleteProject } from '@/lib/services/projects';

type P = { id: string };
export const GET = api<P>(async ({ db, actor, params }) => ({ project: await getProject(db, actor, params.id) }));
export const PATCH = api<P>(async ({ db, actor, params, body }) => ({ project: await updateProject(db, actor, params.id, body) }));
export const DELETE = api<P>(async ({ db, actor, params }) => { await deleteProject(db, actor, params.id); return { ok: true }; });
