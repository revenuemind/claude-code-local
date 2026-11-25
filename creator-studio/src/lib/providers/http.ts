/** Shared HTTP helpers for provider adapters: timeouts, typed errors, retry classification. */
import { ProviderError, type AdapterContext } from './types';

export interface HttpOptions { method?: string; headers?: Record<string, string>; body?: unknown; timeoutMs?: number; raw?: boolean }

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

export async function http(providerId: string, url: string, ctx: AdapterContext, opts: HttpOptions = {}): Promise<Response> {
  const f = ctx.fetch ?? fetch;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 120_000);
  const onAbort = () => ac.abort();
  ctx.signal?.addEventListener('abort', onAbort);
  try {
    const isJson = opts.body !== undefined && !(opts.body instanceof Uint8Array) && typeof opts.body !== 'string';
    const res = await f(url, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: { ...(isJson ? { 'content-type': 'application/json' } : {}), ...opts.headers },
      body: opts.body === undefined ? undefined : isJson ? JSON.stringify(opts.body) : (opts.body as BodyInit),
      signal: ac.signal,
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 600); } catch { /* ignore */ }
      throw new ProviderError(`${providerId} HTTP ${res.status}: ${redact(detail)}`, res.status, isRetryableStatus(res.status), providerId);
    }
    return res;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    const aborted = (e as Error).name === 'AbortError';
    throw new ProviderError(`${providerId} ${aborted ? 'request timed out' : 'network error'}: ${(e as Error).message}`, null, true, providerId);
  } finally {
    clearTimeout(timer);
    ctx.signal?.removeEventListener('abort', onAbort);
  }
}

export async function httpJson<T>(providerId: string, url: string, ctx: AdapterContext, opts: HttpOptions = {}): Promise<T> {
  const res = await http(providerId, url, ctx, opts);
  return (await res.json()) as T;
}

export async function httpBuffer(providerId: string, url: string, ctx: AdapterContext, opts: HttpOptions = {}): Promise<Buffer> {
  const res = await http(providerId, url, ctx, { timeoutMs: 600_000, ...opts });
  return Buffer.from(await res.arrayBuffer());
}

/** Strip anything that looks like a credential from error text before it is stored or shown. */
export function redact(s: string): string {
  return s.replace(/(sk-[A-Za-z0-9_\-]{8,}|key[=:]\s*[A-Za-z0-9_\-]{12,}|Bearer\s+[A-Za-z0-9._\-]{12,})/gi, '[redacted]');
}

export function requireCred(ctx: AdapterContext, key: string, providerId: string): string {
  const v = ctx.credentials[key];
  if (!v) throw new ProviderError(`${providerId}: missing credential “${key}”. Connect it in the AI Engine Manager.`, 401, false, providerId);
  return v;
}

export function aspectToSize(aspect: string): { w: number; h: number } {
  switch (aspect) {
    case '16:9': return { w: 1280, h: 720 };
    case '1:1': return { w: 1024, h: 1024 };
    case '4:5': return { w: 1024, h: 1280 };
    default: return { w: 720, h: 1280 };
  }
}
