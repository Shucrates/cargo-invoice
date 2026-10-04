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

  const allowedHost = getAllowedHost();
  if (!allowedHost) {
    // If NEXTAUTH_URL is not configured at all, skip the check and log a warning
    // so the developer is alerted rather than silently breaking the app.
    console.warn(
      '[CSRF] NEXTAUTH_URL is not set — cannot verify request origin. ' +
        'Set NEXTAUTH_URL in your environment to enable CSRF protection.'
    );
    return { ok: true };
  }

  const originHeader = (req.headers as Headers).get('origin');
  const refererHeader = (req.headers as Headers).get('referer');

  if (originHeader) {
    try {
      const originHost = new URL(originHeader).host;
      if (originHost !== allowedHost) {
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
      if (refererHost !== allowedHost) {
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
