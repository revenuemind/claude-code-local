import { api } from '@/lib/server/api';
import { getProject, rebuildComposition } from '@/lib/services/projects';

export const POST = api<{ id: string }>(async ({ db, actor, params }) => ({ project: await rebuildComposition(db, actor, await getProject(db, actor, params.id), 'Before rebuild') }));
