import { api } from '@/lib/server/api';
import { listMyOrgs, updateProfile } from '@/lib/services/auth';

export const GET = api(async ({ db, actor }) => ({ actor, orgs: await listMyOrgs(db, actor.userId) }));
export const PATCH = api(async ({ db, actor, body }) => { await updateProfile(db, actor, body as never); return { ok: true }; });
