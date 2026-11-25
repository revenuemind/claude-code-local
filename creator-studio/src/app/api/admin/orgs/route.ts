import { api } from '@/lib/server/api';
import { listOrgs } from '@/lib/services/admin';

export const GET = api(async ({ db, actor }) => ({ orgs: await listOrgs(db, actor) }));
