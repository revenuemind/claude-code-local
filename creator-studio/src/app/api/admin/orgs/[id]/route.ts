import { api } from '@/lib/server/api';
import { z } from 'zod';
import { setOrgPlan } from '@/lib/services/admin';

export const PATCH = api<{ id: string }>(async ({ db, actor, params, body }) => { await setOrgPlan(db, actor, params.id, z.object({ planId: z.string() }).parse(body).planId); return { ok: true }; });
