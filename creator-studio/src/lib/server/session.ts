/** Server-component helpers: current actor and interface locale. */
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '../db/client';
import { resolveSession, SESSION_COOKIE } from '../services/auth';
import type { Actor } from '../services/context';
import { isLocale, negotiateLocale, LOCALE_COOKIE, type Locale } from '../i18n/config';

export async function currentActor(): Promise<Actor | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSession(await getDb(), token);
}

export async function requireActor(): Promise<Actor> {
  const a = await currentActor();
  if (!a) redirect('/login');
  return a;
}

export async function currentLocale(actor?: Actor | null): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  if (actor && isLocale(actor.uiLocale)) return actor.uiLocale;
  return negotiateLocale((await headers()).get('accept-language'));
}

export function sessionCookieOptions() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== 'true', path: '/', maxAge: 30 * 24 * 3600 };
}
