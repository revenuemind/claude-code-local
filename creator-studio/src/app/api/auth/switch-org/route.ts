import { api } from '@/lib/server/api';
import { z } from 'zod';
import { switchOrg } from '@/lib/services/auth';

export const POST = api(async ({ db, actor, body }) => { await switchOrg(db, actor, z.object({ orgId: z.string() }).parse(body).orgId); return { ok: true }; });
