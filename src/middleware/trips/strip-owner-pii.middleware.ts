import { Request, Response, NextFunction } from 'express';
import { Place, Trip } from '../../types';
import { isEstimateStale } from '../../lib/trip-cost';

/** Public origin: name and country only — no geonameId or IATA code (contracts §18). */
const publicOrigin = (origin: Place | null) => (origin ? { name: origin.name, countryCode: origin.countryCode } : null);

/** Reduces the cost fields of a shared payload. A stale snapshot is sent as costEstimate: null.
 *  Reads the untouched trip for the staleness hash; only the copies are reduced. */
function publicCostFields(payload: Record<string, unknown>): Record<string, unknown> {
  if (!('costSettings' in payload) && !('costEstimate' in payload)) return payload;
  const trip = payload as unknown as Trip;
  const out: Record<string, unknown> = { ...payload };
  if (trip.costSettings) out.costSettings = { ...trip.costSettings, origin: publicOrigin(trip.costSettings.origin) };
  if ('costEstimate' in payload) {
    const est = trip.costEstimate;
    out.costEstimate = !est || isEstimateStale(trip)
      ? null
      : { ...est, settings: { ...est.settings, origin: publicOrigin(est.settings.origin) } };
  }
  return out;
}

/**
 * Removes owner-identity fields (ownerEmail, ownerId) from req.result before
 * it reaches an unauthenticated public response — handles a single
 * SharedTripPayload-shaped object or an array of them. ownerName is kept
 * (the only owner field any frontend consumer renders for these routes).
 *
 * ownerId is still read internally by captureSharedTripMeta on the
 * clone/favorite POST chains — this middleware must only be placed right
 * before a read chain's respond(), never earlier.
 */
export function stripOwnerPii(req: Request, _res: Response, next: NextFunction): void {
  const strip = (payload: Record<string, unknown>): Record<string, unknown> => {
    const { ownerEmail, ownerId, ...rest } = payload;
    return publicCostFields(rest);
  };

  if (Array.isArray(req.result)) {
    req.result = (req.result as Record<string, unknown>[]).map(strip);
  } else if (req.result && typeof req.result === 'object') {
    req.result = strip(req.result as Record<string, unknown>);
  }

  next();
}
