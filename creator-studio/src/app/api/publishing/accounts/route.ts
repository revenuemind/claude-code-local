import { api } from '@/lib/server/api';
import { listAccounts, connectAccountManually } from '@/lib/services/publishing';
import { oauthConfigured } from '@/lib/publishing/oauth';

export const GET = api(async ({ db, actor }) => ({
  accounts: await listAccounts(db, actor),
  oauth: { youtube: oauthConfigured('youtube'), tiktok: oauthConfigured('tiktok'), instagram: oauthConfigured('instagram'), facebook: oauthConfigured('facebook') },
  publicUrlConfigured: !!process.env.APP_PUBLIC_URL,
}));
export const POST = api(async ({ db, actor, body }) => ({ account: await connectAccountManually(db, actor, body) }));
