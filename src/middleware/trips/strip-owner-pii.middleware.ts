import { Request, Response, NextFunction } from 'express';

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
    return rest;
  };

  if (Array.isArray(req.result)) {
    req.result = (req.result as Record<string, unknown>[]).map(strip);
  } else if (req.result && typeof req.result === 'object') {
    req.result = strip(req.result as Record<string, unknown>);
  }

  next();
}
