import { Request } from 'express';

/** `u:{userId}` for a logged-in caller (via optionalAuth), `ip:{req.ip}` otherwise. */
export function highlightIdentity(req: Request): string {
  return req.user ? `u:${req.user.userId}` : `ip:${req.ip ?? 'unknown'}`;
}
