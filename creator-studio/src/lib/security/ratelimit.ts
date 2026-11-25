/**
 * In-memory sliding-window rate limiter. Suitable for a single instance; for
 * multi-instance deployments back it with Redis (same interface).
 */
interface Bucket { hits: number[] }
const buckets = new Map<string, Bucket>();

export interface RateLimitResult { ok: boolean; remaining: number; retryAfterSec: number }

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const b = buckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= limit) {
    buckets.set(key, b);
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((windowMs - (now - b.hits[0])) / 1000) };
  }
  b.hits.push(now);
  buckets.set(key, b);
  if (buckets.size > 50_000) {
    for (const [k, v] of buckets) if (!v.hits.some((t) => now - t < windowMs)) buckets.delete(k);
  }
  return { ok: true, remaining: limit - b.hits.length, retryAfterSec: 0 };
}

export function resetRateLimits() { buckets.clear(); }
