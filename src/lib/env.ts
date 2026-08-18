const isProduction = process.env.NODE_ENV === 'production';

/**
 * Reads a required secret from the environment.
 *
 * In production a missing secret is fatal — we would rather the request (or the
 * build) fail loudly than silently fall back to a value that is committed to the
 * repo and therefore known to everyone.
 *
 * In development we allow a clearly-labelled fallback so `npm run dev` works on a
 * fresh clone without any setup.
 */
export function requireSecret(name: string): string {
  const value = process.env[name];

  if (value && value.trim()) return value;

  if (isProduction) {
    throw new Error(
      `${name} is not set. Refusing to start with an insecure default. ` +
        `Set ${name} in the deployment environment.`
    );
  }

  return `dev-only-insecure-${name.toLowerCase()}-do-not-use-in-production`;
}

/**
 * Timing-safe string comparison for secrets presented by a caller.
 * Avoids leaking the secret one byte at a time via response-time differences.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
