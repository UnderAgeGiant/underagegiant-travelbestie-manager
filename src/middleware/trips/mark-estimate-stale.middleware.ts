import { Request, Response, NextFunction } from 'express';
import { Trip } from '../../types';
import { isEstimateStale } from '../../lib/trip-cost';

/** Copy of the trip with costEstimate.stale = true when its snapshot no longer matches the trip's inputs. */
function markStale(trip: Trip): Trip {
  if (!trip.costEstimate || !isEstimateStale(trip)) return trip;
  return { ...trip, costEstimate: { ...trip.costEstimate, stale: true } };
}

/**
 * Owner/collaborator Trip responses: flags a stale cost snapshot (e.g. edits saved only by autosave).
 * Handles a single Trip-shaped result or an array. Computed on the way out — the stored object is never changed.
 */
export function markEstimateStale(req: Request, _res: Response, next: NextFunction): void {
  if (Array.isArray(req.result)) {
    req.result = (req.result as Trip[]).map(markStale);
  } else if (req.result && typeof req.result === 'object') {
    req.result = markStale(req.result as Trip);
  }
  next();
}
