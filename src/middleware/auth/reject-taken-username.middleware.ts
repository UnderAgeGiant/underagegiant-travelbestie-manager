import { Request, Response, NextFunction } from 'express';
import { respondError } from '../../lib/respond-error';

export function rejectTakenUsername(req: Request, res: Response, next: NextFunction): void {
  if (req.usernameOwner && req.usernameOwner.id !== req.user!.userId) {
    respondError(req, res, 409, { error: 'USERNAME_TAKEN' });
    return;
  }
  next();
}
