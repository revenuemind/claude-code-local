import { api } from '@/lib/server/api';
import { z } from 'zod';
import { listMembers, addMember } from '@/lib/services/auth';
import { assertCan } from '@/lib/services/context';
import { ROLES } from '@/lib/auth/rbac';

export const GET = api(async ({ db, actor }) => { assertCan(actor, 'members.read'); return { members: await listMembers(db, actor.orgId) }; });
export const POST = api(async ({ db, actor, body }) => {
  assertCan(actor, 'members.manage');
  const b = z.object({ email: z.string().email(), role: z.enum(ROLES) }).parse(body);
  await addMember(db, actor, b.email, b.role);
  return { ok: true };
});
