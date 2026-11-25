import { api } from '@/lib/server/api';
import { listPlans, upsertPlan } from '@/lib/services/admin';
import { assertPlatformAdmin } from '@/lib/services/context';

export const GET = api(async ({ db, actor }) => { assertPlatformAdmin(actor); return { plans: await listPlans(db) }; });
export const PUT = api(async ({ db, actor, body }) => { await upsertPlan(db, actor, body); return { ok: true }; });
