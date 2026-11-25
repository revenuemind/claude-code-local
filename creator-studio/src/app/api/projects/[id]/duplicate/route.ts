import { api } from '@/lib/server/api';
import { duplicateProject } from '@/lib/services/projects';

export const POST = api<{ id: string }>(async ({ db, actor, params }) => ({ project: await duplicateProject(db, actor, params.id) }));
