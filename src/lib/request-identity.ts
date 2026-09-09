import { Request } from 'express';
import { readAnonymousId } from './highlight-identity';

/**
 * A single stable identifier for "who is making this request" — req.user.userId once
 * authenticated, else the frontend's X-Anonymous-Id header (the same UUID persisted in
 * localStorage per browser profile that highlightIdentity() already trusts), else null
 * (older frontend build, header stripped, private-browsing storage failure). Added
 * alongside — not instead of — the existing flowId/userId log fields so a support session
 * can grep one value and see a user's full activity trail, including pre-login browsing and
 * the login/register calls themselves (req.user can never cover those — auth hasn't
 * happened yet at that point in the request).
 */
export function resolveUserKey(req: Request): string | null {
  return req.user?.userId ?? readAnonymousId(req) ?? null;
}
