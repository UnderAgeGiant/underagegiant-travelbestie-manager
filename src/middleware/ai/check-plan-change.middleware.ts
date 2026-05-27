import { Request, Response, NextFunction } from 'express';
import { redis, planSessionKey } from '../../lib/redis';
import { isMinorChange, toSessionOptions, FREE_CHANGE_LIMIT } from '../../lib/plan-change-detector';
import { PlanChangeResult, PlanSessionOptions } from '../../types';
import { logger } from '../../lib/logger';

interface PlanRedisSession {
  originalOptions: PlanSessionOptions;
  freeChangesUsed: number;
}

/**
 * Reads the Redis plan session for this user+planSessionId pair.
 * Sets req.planChangeResult to one of:
 *   - { type: 'new_session' }         — no planSessionId or no Redis data
 *   - { type: 'free_change', ... }    — ≤20% change, free slots remaining
 *   - { type: 'charged_change', ... } — >20% change OR free limit reached
 *
 * Falls back to 'new_session' on Redis errors (charge normally).
 */
export const checkPlanChange = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const planSessionId = req.body.planSessionId as string | undefined;

  if (!planSessionId) {
    req.planChangeResult = { type: 'new_session' };
    return next();
  }

  try {
    const key    = planSessionKey(req.user!.userId, planSessionId);
    const raw    = await redis.get(key);

    if (!raw) {
      // First plan call in this session
      req.planChangeResult = { type: 'new_session' };
      return next();
    }

    const session        = JSON.parse(raw) as PlanRedisSession;
    const currentOptions = toSessionOptions(req.body);
    const minor          = isMinorChange(session.originalOptions, currentOptions);
    const used           = session.freeChangesUsed;

    if (!minor) {
      req.planChangeResult = {
        type:            'charged_change',
        reason:          'major_change',
        freeChangesUsed: used,
        originalOptions: session.originalOptions,
      } satisfies PlanChangeResult;
    } else if (used >= FREE_CHANGE_LIMIT) {
      req.planChangeResult = {
        type:            'charged_change',
        reason:          'limit_reached',
        freeChangesUsed: used,
        originalOptions: session.originalOptions,
      } satisfies PlanChangeResult;
    } else {
      req.planChangeResult = {
        type:                 'free_change',
        freeChangesUsed:      used,           // count BEFORE this change
        freeChangesRemaining: FREE_CHANGE_LIMIT - used - 1,
        originalOptions:      session.originalOptions,
      } satisfies PlanChangeResult;
    }
  } catch (err) {
    logger.warn({ flowId: req.flowId, msg: 'Redis unavailable in checkPlanChange; treating as new_session', err });
    req.planChangeResult = { type: 'new_session' };
  }

  next();
};
