import { Request, Response, NextFunction } from 'express';
import { respondError } from '../../lib/respond-error';

export function requireAcceptedInvite(req: Request, res: Response, next: NextFunction): void {
  if (!req.collaboratorAccepted) {
    respondError(req, res, 404, { error: 'No tienes una invitación pendiente para este viaje' });
    return;
  }
  next();
}
