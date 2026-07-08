import { Request, Response, NextFunction } from 'express';
import { SharedTripPayload } from '../../types';

/**
 * Stash owner/trip identity from the SharedTripPayload that trip.findByShareId
 * put on req.result, before later middleware (favoriteToggle, buildTripResponse)
 * overwrite req.result. Consumed by the notify middlewares.
 */
export function captureSharedTripMeta(req: Request, _res: Response, next: NextFunction): void {
  const payload = req.result as SharedTripPayload | undefined;
  if (payload?.ownerId) {
    req.sharedTripMeta = { tripId: payload.tripId, ownerId: payload.ownerId, tripName: payload.tripName };
  }
  next();
}
