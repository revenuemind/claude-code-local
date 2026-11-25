import { api } from '@/lib/server/api';
import { auditLog } from '@/lib/services/admin';

export const GET = api(async ({ db, actor }) => ({ entries: await auditLog(db, actor) }));
