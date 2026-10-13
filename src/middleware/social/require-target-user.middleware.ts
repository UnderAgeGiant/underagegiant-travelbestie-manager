import { Request, Response, NextFunction } from 'express';
import { respondError } from '../../lib/respond-error';

export function requireTargetUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.targetUser) { respondError(req, res, 404, { error: 'Usuario no encontrado' }); return; }
  next();
}
