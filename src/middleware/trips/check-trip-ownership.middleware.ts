import { Request, Response, NextFunction } from 'express';
import { respondError } from '../../lib/respond-error';

export function checkTripOwnership(req: Request, res: Response, next: NextFunction): void {
  if (!req.trip || req.trip.ownerId !== req.user!.userId) {
    respondError(req, res, 404, { error: 'Trip not found' }); return;
  }
  next();
}
