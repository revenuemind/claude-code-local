/**
 * Route-handler wrapper: authentication, CSRF (Origin) checks for mutations,
 * rate limiting, JSON body parsing and uniform error mapping.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { getDb, type DB } from '../db/client';
import { resolveSession, SESSION_COOKIE } from '../services/auth';
import { AppError, type Actor } from '../services/context';
import { ProviderError } from '../providers/types';
import { rateLimit } from '../security/ratelimit';
import { redact } from '../providers/http';

export interface ApiCtx<P> { req: NextRequest; db: DB; actor: Actor; params: P; body: unknown; ip: string | null }
export interface PublicCtx<P> { req: NextRequest; db: DB; actor: Actor | null; params: P; body: unknown; ip: string | null }

interface Opts { auth?: boolean; limit?: { name: string; max: number; windowMs: number }; rawBody?: boolean }

export function clientIp(req: NextRequest): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
}

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('sec-fetch-site') !== 'cross-site';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  try { return new URL(origin).host === host; } catch { return false; }
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof AppError) return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: { code: 'validation', message: 'Invalid input', details: e.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })) } }, { status: 400 });
  if (e instanceof ProviderError) return NextResponse.json({ error: { code: 'provider', message: redact(e.message) } }, { status: e.status && e.status >= 400 && e.status < 500 ? 400 : 502 });
  console.error('[api] unhandled error', e);
  return NextResponse.json({ error: { code: 'internal', message: 'Internal error' } }, { status: 500 });
}

type RouteCtx<P> = { params: Promise<P> };

export function api<P = Record<string, string>>(fn: (ctx: ApiCtx<P>) => Promise<unknown>, opts?: Opts): (req: NextRequest, rc: RouteCtx<P>) => Promise<Response>;
export function api<P = Record<string, string>>(fn: (ctx: PublicCtx<P>) => Promise<unknown>, opts: Opts & { auth: false }): (req: NextRequest, rc: RouteCtx<P>) => Promise<Response>;
export function api<P>(fn: (ctx: ApiCtx<P> & PublicCtx<P>) => Promise<unknown>, opts: Opts = {}) {
  return async (req: NextRequest, rc: RouteCtx<P>) => {
    try {
      const ip = clientIp(req);
      const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      if (mutating && !sameOrigin(req)) return NextResponse.json({ error: { code: 'csrf', message: 'Cross-site request blocked' } }, { status: 403 });
      if (opts.limit) {
        const r = rateLimit(`${opts.limit.name}:${ip ?? 'unknown'}`, opts.limit.max, opts.limit.windowMs);
        if (!r.ok) return NextResponse.json({ error: { code: 'rate_limited', message: 'Too many requests' } }, { status: 429, headers: { 'retry-after': String(r.retryAfterSec) } });
      }
      const db = await getDb();
      const actor = await resolveSession(db, req.cookies.get(SESSION_COOKIE)?.value);
      if (opts.auth !== false && !actor) return NextResponse.json({ error: { code: 'unauthorized', message: 'Sign in required' } }, { status: 401 });
      if (actor) {
        actor.ip = ip;
        const r = rateLimit(`user:${actor.userId}`, Number(process.env.API_RATE_LIMIT_PER_MIN ?? 600), 60_000);
        if (!r.ok) return NextResponse.json({ error: { code: 'rate_limited', message: 'Too many requests' } }, { status: 429 });
      }
      let body: unknown = undefined;
      if (mutating && !opts.rawBody && (req.headers.get('content-type') ?? '').includes('application/json')) {
        const text = await req.text();
        if (text.length > 5_000_000) return NextResponse.json({ error: { code: 'too_large', message: 'Body too large' } }, { status: 413 });
        body = text ? JSON.parse(text) : undefined;
      }
      const params = (await rc?.params) ?? ({} as P);
      const result = await fn({ req, db, actor: actor as Actor, params, body, ip });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof SyntaxError) return NextResponse.json({ error: { code: 'bad_json', message: 'Malformed JSON body' } }, { status: 400 });
      return errorResponse(e);
    }
  };
}
