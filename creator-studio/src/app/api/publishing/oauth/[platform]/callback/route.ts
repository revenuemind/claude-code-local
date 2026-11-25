import { api } from '@/lib/server/api';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { finishOAuth } from '@/lib/services/publishing';

export const GET = api<{ platform: string }>(async ({ db, params, req }) => {
  const platform = z.enum(['youtube', 'tiktok', 'instagram', 'facebook']).parse(params.platform);
  const sp = req.nextUrl.searchParams;
  const base = new URL('/publishing', req.nextUrl.origin);
  if (sp.get('error')) { base.searchParams.set('oauth_error', sp.get('error_description') ?? sp.get('error')!); return NextResponse.redirect(base); }
  try {
    const n = await finishOAuth(db, platform, sp.get('state') ?? '', sp.get('code') ?? '');
    base.searchParams.set('connected', String(n));
  } catch (e) { base.searchParams.set('oauth_error', (e as Error).message.slice(0, 200)); }
  return NextResponse.redirect(base);
}, { auth: false });
