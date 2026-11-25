import { api } from '@/lib/server/api';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LOCALES, LOCALE_COOKIE } from '@/lib/i18n/config';
import { updateProfile } from '@/lib/services/auth';

export const POST = api(async ({ db, actor, body }) => {
  const { locale } = z.object({ locale: z.enum(LOCALES) }).parse(body);
  if (actor) await updateProfile(db, actor, { uiLocale: locale });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 365 * 24 * 3600, sameSite: 'lax' });
  return res;
}, { auth: false });
