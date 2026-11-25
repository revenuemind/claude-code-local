import { api } from '@/lib/server/api';
import { approvePlan } from '@/lib/services/projects';

export const POST = api<{ id: string }>(async ({ db, actor, params }) => ({ project: await approvePlan(db, actor, params.id) }));
