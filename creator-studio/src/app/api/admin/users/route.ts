import { api } from '@/lib/server/api';
import { listUsers } from '@/lib/services/admin';

export const GET = api(async ({ db, actor }) => ({ users: await listUsers(db, actor) }));
