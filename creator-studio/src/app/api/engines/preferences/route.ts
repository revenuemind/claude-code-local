import { api } from '@/lib/server/api';
import { setEnginePrefs } from '@/lib/services/engines';

export const PUT = api(async ({ db, actor, body }) => ({ preferences: await setEnginePrefs(db, actor, body) }));
