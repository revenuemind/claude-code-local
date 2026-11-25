import { api } from '@/lib/server/api';
import { duplicateTemplate } from '@/lib/services/templates';
import { assertCanCreateTemplate } from '@/lib/services/usage';

export const POST = api<{ id: string }>(async ({ db, actor, params }) => { await assertCanCreateTemplate(db, actor.orgId); return { template: await duplicateTemplate(db, actor, params.id) }; });
