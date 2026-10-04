/**
 * Lightweight in-process rate limiter.
 *
 * NOTE: In a serverless / edge environment each function instance has its own
 * memory, so this does not coordinate across Vercel worker processes. For
 * production-grade cross-instance limiting use Upstash Redis + @upstash/ratelimit.
 * This is still useful as a first line of defence against single-instance abuse
 * (e.g. the same worker repeatedly hit by one IP during the same request burst).
 *
 * Usage:
 *   const result = rateLimit(req, { limit: 5, windowMs: 60_000 });
 *   if (!result.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Module-level map — lives for the lifetime of the worker process.
const store = new Map<string, RateLimitEntry>();

// Purge stale entries every 5 minutes so memory doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 5 * 60 * 1000);

interface RateLimitOptions {
  /** Maximum number of requests allowed in the window. */
  limit: number;
  /** Sliding window in milliseconds. Default: 60 000 (1 minute). */
  windowMs?: number;
  /**
   * Optional key suffix to namespace separate limiters
   * (e.g. 'login' vs 'api').
   */
  namespace?: string;
}

interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Returns the best available client IP from the request headers.
 * Next.js / Vercel sets `x-forwarded-for`; fall back to a sentinel
 * that still provides some protection even when the header is absent.
 */
function getIp(req: Request): string {
  const xff = (req.headers as Headers).get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}

export function rateLimit(req: Request, options: RateLimitOptions): RateLimitResult {
  const { limit, windowMs = 60_000, namespace = 'default' } = options;
  const ip = getIp(req);
  const key = `${namespace}:${ip}`;
  const now = Date.now();

  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  entry.count += 1;
  const remaining = Math.max(limit - entry.count, 0);

  if (entry.count > limit) {
    return { ok: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { ok: true, remaining, resetAt: entry.resetAt };
}
