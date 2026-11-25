import { api } from '@/lib/server/api';
import { PROVIDERS } from '@/lib/providers/registry';
import { listCredentials, getEnginePrefs } from '@/lib/services/engines';

export const GET = api(async ({ db, actor }) => ({
  providers: PROVIDERS.map((p) => ({ ...p, platformKeyAvailable: !!(p.platformEnvKey && process.env[p.platformEnvKey]), platformEnvKey: undefined })),
  credentials: await listCredentials(db, actor),
  preferences: await getEnginePrefs(db, actor.orgId),
}));
