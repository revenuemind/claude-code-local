import { api } from '@/lib/server/api';
import { health } from '@/lib/services/admin';
import { assertPlatformAdmin } from '@/lib/services/context';

export const GET = api(async ({ db, actor }) => { assertPlatformAdmin(actor); return { checks: await health(db) }; });
