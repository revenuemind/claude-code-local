import { api } from '@/lib/server/api';
import { NextResponse } from 'next/server';
import { register, createSession, SESSION_COOKIE } from '@/lib/services/auth';
import { sessionCookieOptions } from '@/lib/server/session';

export const POST = api(async ({ db, body, ip, req }) => {
  const { user, org } = await register(db, body as never, ip);
  const token = await createSession(db, user.id, org.id, { ip, userAgent: req.headers.get('user-agent') });
  const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}, { auth: false, limit: { name: 'register', max: 10, windowMs: 60 * 60_000 } });
