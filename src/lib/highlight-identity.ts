import { Request } from 'express';

const ANONYMOUS_ID_HEADER = 'x-anonymous-id';
// Frontend generates this with crypto.randomUUID() — reject anything that doesn't match
// so an arbitrary/oversized header value can't land in the Redis key.
const ANONYMOUS_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The validated X-Anonymous-Id header, or null if absent/malformed. Shared with
 *  migrate-anonymous-highlights.middleware.ts so both places agree on what counts as
 *  a well-formed id. */
export function readAnonymousId(req: Request): string | null {
  const anonymousId = req.header(ANONYMOUS_ID_HEADER);
  return anonymousId && ANONYMOUS_ID_PATTERN.test(anonymousId) ? anonymousId : null;
}

/**
 * `u:{userId}` for a logged-in caller (via optionalAuth); `a:{anonymousId}` for an
 * anonymous caller carrying a valid client-generated id (see the frontend's
 * AnonymousIdService — a UUID persisted in localStorage per browser profile, letting a
 * RETURNING anonymous visitor be recognized individually instead of lumped together with
 * everyone else behind the same IP/NAT); `ip:{req.ip}` as the last-resort fallback when
 * neither is present (older frontend build, header stripped, private-browsing storage
 * failure, etc.).
 */
export function highlightIdentity(req: Request): string {
  if (req.user) return `u:${req.user.userId}`;
  const anonymousId = readAnonymousId(req);
  if (anonymousId) return `a:${anonymousId}`;
  return `ip:${req.ip ?? 'unknown'}`;
}
