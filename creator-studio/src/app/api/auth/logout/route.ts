import { api } from '@/lib/server/api';
import { NextResponse } from 'next/server';
import { logout, SESSION_COOKIE } from '@/lib/services/auth';

export const POST = api(async ({ db, req }) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await logout(db, token);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}, { auth: false });
