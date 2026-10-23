import { Request, Response, NextFunction } from 'express';
import { DEFAULT_COST_SETTINGS, estimateInputsHash } from '../../lib/trip-cost';

/** Stored snapshot still matches the trip's inputs and has no unpriced legs: answer it, no DeepSeek call. */
export function returnFreshEstimate(req: Request, res: Response, next: NextFunction): void {
  const trip = req.trip!;
  const snapshot = trip.costEstimate;
  if (
    snapshot
    && snapshot.inputsHash === estimateInputsHash(trip, trip.costSettings ?? DEFAULT_COST_SETTINGS)
    && snapshot.unestimated.length === 0
  ) {
    const { stale: _stale, ...fresh } = snapshot;
    res.status(200).json(fresh);
    return;
  }
  next();
}
