import { api } from '@/lib/server/api';
import { NextResponse } from 'next/server';
import { login, SESSION_COOKIE } from '@/lib/services/auth';
import { sessionCookieOptions } from '@/lib/server/session';

export const POST = api(async ({ db, body, ip, req }) => {
  const { token, user } = await login(db, body as never, { ip, userAgent: req.headers.get('user-agent') });
  const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, uiLocale: user.uiLocale } });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}, { auth: false, limit: { name: 'login', max: 20, windowMs: 15 * 60_000 } });
