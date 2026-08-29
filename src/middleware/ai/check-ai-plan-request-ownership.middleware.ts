import { Request, Response, NextFunction } from 'express';
import { respondError } from '../../lib/respond-error';

/** 404 (not 403 — same anti-enumeration convention as checkTripOwnership) if the request doesn't exist or belongs to someone else. */
export function checkAiPlanRequestOwnership(req: Request, res: Response, next: NextFunction): void {
  if (!req.aiPlanRequest || req.aiPlanRequest.userId !== req.user!.userId) {
    respondError(req, res, 404, { error: 'AI plan request not found' }); return;
  }
  next();
}
