import { api } from '@/lib/server/api';
import { redraftPlan } from '@/lib/services/projects';

export const POST = api<{ id: string }>(async ({ db, actor, params }) => ({ project: await redraftPlan(db, actor, params.id) }));
