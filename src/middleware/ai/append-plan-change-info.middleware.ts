import { Request, Response, NextFunction } from 'express';
import { FREE_CHANGE_LIMIT } from '../../lib/plan-change-detector';
import { PlanChangeInfo, PlanTripResponse } from '../../types';

/**
 * Merges `changeInfo` into `req.result` so the frontend can display feedback.
 * Must run after ai.plan (which sets req.result) and after storePlanSession.
 */
export const appendPlanChangeInfo = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const result = req.planChangeResult;
  if (!result) return next();

  let changeInfo: PlanChangeInfo;

  if (result.type === 'new_session') {
    changeInfo = {
      type:                 'new_session',
      freeChangesUsed:      0,
      freeChangesRemaining: FREE_CHANGE_LIMIT,
    };
  } else if (result.type === 'free_change') {
    changeInfo = {
      type:                 'free_change',
      freeChangesUsed:      result.freeChangesUsed + 1,   // count AFTER this change
      freeChangesRemaining: result.freeChangesRemaining,
    };
  } else {
    changeInfo = {
      type:                 'charged_change',
      freeChangesUsed:      result.freeChangesUsed,
      freeChangesRemaining: 0,
      reason:               result.reason,
    };
  }

  req.result = { ...(req.result as PlanTripResponse), changeInfo };
  next();
};
