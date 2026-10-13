import { Request, Response, NextFunction } from 'express';
import { respondError } from '../../lib/respond-error';
import { isUsernameAllowed } from '../../lib/usernames';

/** PUT /auth/profile: format + reserved words. One code for both — the client shows one message. */
export function validateUsername(req: Request, res: Response, next: NextFunction): void {
  const u = req.body.username as string | undefined;
  if (u !== undefined && !isUsernameAllowed(u)) {
    respondError(req, res, 400, { error: 'USERNAME_NOT_ALLOWED' });
    return;
  }
  next();
}
