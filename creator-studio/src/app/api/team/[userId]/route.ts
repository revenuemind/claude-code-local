import { api } from '@/lib/server/api';
import { z } from 'zod';
import { setMemberRole, removeMember } from '@/lib/services/auth';
import { assertCan } from '@/lib/services/context';
import { ROLES } from '@/lib/auth/rbac';

type P = { userId: string };
export const PATCH = api<P>(async ({ db, actor, params, body }) => { assertCan(actor, 'members.manage'); await setMemberRole(db, actor, params.userId, z.object({ role: z.enum(ROLES) }).parse(body).role); return { ok: true }; });
export const DELETE = api<P>(async ({ db, actor, params }) => { assertCan(actor, 'members.manage'); await removeMember(db, actor, params.userId); return { ok: true }; });
