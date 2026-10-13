import { Request, Response, NextFunction } from 'express';
import { respondError } from '../../lib/respond-error';
import { isUsernameFormatValid } from '../../lib/usernames';

/** Lowercases :username and 404s anything that could never be a stored username — before any DB read. */
export function validateUsernameParam(req: Request, res: Response, next: NextFunction): void {
  const u = String(req.params.username ?? '').toLowerCase();
  if (!isUsernameFormatValid(u)) {
    respondError(req, res, 404, { error: 'Usuario no encontrado' });
    return;
  }
  req.params.username = u;
  next();
}
