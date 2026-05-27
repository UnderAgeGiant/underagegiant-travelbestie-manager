import { Request, Response, NextFunction } from 'express';
import { redis, planSessionKey } from '../../lib/redis';
import { toSessionOptions } from '../../lib/plan-change-detector';
import { PlanSessionOptions } from '../../types';
import { logger } from '../../lib/logger';

const SESSION_TTL_SECONDS = 600; // 10 minutes

interface PlanRedisSession {
  originalOptions: PlanSessionOptions;
  freeChangesUsed: number;
}

/**
 * After a successful ai.plan call, writes/updates the Redis plan session.
 * - new_session:     store current options as original, freeChangesUsed = 0
 * - free_change:     keep original options, increment freeChangesUsed
 * - charged_change:  store current options as new original, reset freeChangesUsed = 0
 *
 * Redis errors are non-fatal — the plan response is still returned.
 */
export const storePlanSession = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const planSessionId = req.body.planSessionId as string | undefined;
  if (!planSessionId) return next();

  const result = req.planChangeResult;
  if (!result) return next();

  const currentOptions = toSessionOptions(req.body);
  const key            = planSessionKey(req.user!.userId, planSessionId);

  let newSession: PlanRedisSession;

  if (result.type === 'free_change') {
    newSession = {
      originalOptions: result.originalOptions,
      freeChangesUsed: result.freeChangesUsed + 1,
    };
  } else {
    // new_session or charged_change: reset baseline to current options
    newSession = {
      originalOptions: currentOptions,
      freeChangesUsed: 0,
    };
  }

  try {
    await redis.set(key, JSON.stringify(newSession), 'EX', SESSION_TTL_SECONDS);
  } catch (err) {
    logger.warn({ flowId: req.flowId, msg: 'Failed to store plan session in Redis', err });
    // Non-fatal: the plan was already generated; don't fail the response
  }

  next();
};
