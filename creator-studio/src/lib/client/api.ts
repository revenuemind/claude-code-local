/** Browser fetch helper for the studio API. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

export async function apiFetch<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  const init: RequestInit = { method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'), credentials: 'same-origin', signal: opts.signal };
  if (opts.form) init.body = opts.form;
  else if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers = { 'content-type': 'application/json' }; }
  let res: Response;
  try { res = await fetch(path, init); } catch (e) { throw new ApiError(0, 'network', (e as Error).message); }
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('application/json') ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth')) window.location.href = '/login';
    const err = (data as { error?: { code: string; message: string; details?: unknown } } | null)?.error;
    const details = Array.isArray(err?.details) ? (err!.details as Array<{ path: string; message: string }>).map((d) => `${d.path}: ${d.message}`).join('; ') : '';
    throw new ApiError(res.status, err?.code ?? 'http', `${err?.message ?? res.statusText}${details ? ` — ${details}` : ''}`, err?.details);
  }
  return data as T;
}

export const assetUrl = (id: string, download = false) => `/api/assets/${id}/file${download ? '?download=1' : ''}`;
