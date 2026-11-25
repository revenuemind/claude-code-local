import { api } from '@/lib/server/api';
import { savePlan } from '@/lib/services/projects';

export const PUT = api<{ id: string }>(async ({ db, actor, params, body }) => ({ project: await savePlan(db, actor, params.id, (body as { plan: unknown }).plan) }));
