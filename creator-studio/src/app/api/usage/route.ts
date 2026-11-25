import { api } from '@/lib/server/api';
import { usageSummary } from '@/lib/services/usage';
import { assertCan } from '@/lib/services/context';

export const GET = api(async ({ db, actor }) => { assertCan(actor, 'project.read'); return usageSummary(db, actor.orgId); });
