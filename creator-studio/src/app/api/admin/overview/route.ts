import { api } from '@/lib/server/api';
import { overview } from '@/lib/services/admin';

export const GET = api(async ({ db, actor }) => overview(db, actor));
