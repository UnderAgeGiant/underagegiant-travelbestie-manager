import { Request, Response, NextFunction } from 'express';
import { respondError } from '../../lib/respond-error';

export function rejectSelfFollow(req: Request, res: Response, next: NextFunction): void {
  if (req.targetUser!.id === req.user!.userId) { respondError(req, res, 400, { error: 'No puedes seguirte a ti mismo' }); return; }
  next();
}
