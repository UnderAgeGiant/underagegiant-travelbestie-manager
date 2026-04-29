import { Request, Response, NextFunction } from 'express';

export function checkTripOwnership(req: Request, res: Response, next: NextFunction): void {
  if (!req.trip || req.trip.ownerId !== req.user!.userId) {
    res.status(404).json({ error: 'Trip not found' }); return;
  }
  next();
}
