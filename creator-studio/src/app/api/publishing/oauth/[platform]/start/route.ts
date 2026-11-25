import { api } from '@/lib/server/api';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { startOAuth } from '@/lib/services/publishing';

export const GET = api<{ platform: string }>(async ({ db, actor, params }) => {
  const platform = z.enum(['youtube', 'tiktok', 'instagram', 'facebook']).parse(params.platform);
  return NextResponse.redirect(await startOAuth(db, actor, platform));
});
