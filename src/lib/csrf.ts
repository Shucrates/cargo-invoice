/**
 * CSRF protection utility for Next.js App Router route handlers.
 *
 * Validates that the `Origin` or `Referer` header of a mutating request
 * (POST / PATCH / PUT / DELETE) matches the app's canonical host, so that a
 * cross-site form or fetch from a third-party page cannot forge state-changing
 * actions using the victim's session cookie.
 *
 * Usage:
 *   const csrf = verifyCsrf(req);
 *   if (!csrf.ok) return NextResponse.json({ error: csrf.error }, { status: 403 });
 */

/**
 * Derives the canonical host from the environment.
 * Prefers NEXTAUTH_URL (already set in .env) so this works in both local dev
 * and production without additional configuration.
 */
function getAllowedHost(): string | null {
  const raw = process.env.NEXTAUTH_URL || process.env.AUTH_URL;
  if (!raw) return null;
  try {
    return new URL(raw).host; // e.g. "admin.rudracargo.com" or "localhost:3000"
  } catch {
    return null;
  }
}

interface CsrfResult {
  ok: boolean;
  error?: string;
}

/**
 * Checks the Origin (preferred) or Referer header against the allowed host.
 *
 * Requests that carry neither header are rejected — all modern browsers send
 * at least one on same-site navigations and fetch() calls. Server-to-server
 * callers (like the Vercel cron) should authenticate via Bearer token instead,
 * and those routes should skip CSRF (they don't use cookies).
 */
export function verifyCsrf(req: Request): CsrfResult {
  // Only enforce on mutating methods.
  const method = req.method?.toUpperCase();
  if (!method || ['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return { ok: true };
  }

  // Same-origin requests are always allowed: a browser will not let a
  // third-party page set the Host header, so Origin === Host means the request
  // came from a page on this deployment (admin.*, a vercel.app URL, localhost).
  const allowedHosts = new Set<string>();
  const configuredHost = getAllowedHost();
  if (configuredHost) allowedHosts.add(configuredHost);
  const requestHost = (req.headers as Headers).get('x-forwarded-host') || (req.headers as Headers).get('host');
  if (requestHost) allowedHosts.add(requestHost.split(',')[0].trim());
  if (allowedHosts.size === 0) {
    console.warn('[CSRF] Neither NEXTAUTH_URL nor a Host header is available — cannot verify request origin.');
    return { ok: true };
  }

  const originHeader = (req.headers as Headers).get('origin');
  const refererHeader = (req.headers as Headers).get('referer');

  if (originHeader) {
    try {
      const originHost = new URL(originHeader).host;
      if (!allowedHosts.has(originHost)) {
        return { ok: false, error: `Forbidden: request origin "${originHost}" is not allowed.` };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'Forbidden: malformed Origin header.' };
    }
  }

  if (refererHeader) {
    try {
      const refererHost = new URL(refererHeader).host;
      if (!allowedHosts.has(refererHost)) {
        return { ok: false, error: `Forbidden: request referer "${refererHost}" is not allowed.` };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'Forbidden: malformed Referer header.' };
    }
  }

  // Neither header present — reject.
  return { ok: false, error: 'Forbidden: missing Origin or Referer header.' };
}
