import { redis, planSessionKey } from './redis';
import { PlanChangeResult, PlanSessionOptions } from '../types';
import { logger } from './logger';

const SESSION_TTL_SECONDS = 600; // 10 minutes

interface PlanRedisSession {
  originalOptions: PlanSessionOptions;
  freeChangesUsed: number;
}

/**
 * Writes/updates the Redis free-change session after a successful /ai/plan
 * generation. Moved out of store-plan-session.middleware.ts (deleted) so the
 * background AI plan job (src/lib/ai-plan-job.ts) can call it directly — it
 * has no Express req/res to run middleware against.
 *
 * - free_change:               keep original options, increment freeChangesUsed
 * - new_session/charged_change: store current options as the new original, reset to 0
 *
 * Redis errors are non-fatal — logged and swallowed, matching the original middleware.
 */
export async function writePlanSession(
  userId: string,
  planSessionId: string,
  result: PlanChangeResult,
  currentOptions: PlanSessionOptions,
): Promise<void> {
  const key = planSessionKey(userId, planSessionId);

  const newSession: PlanRedisSession = result.type === 'free_change'
    ? { originalOptions: result.originalOptions, freeChangesUsed: result.freeChangesUsed + 1 }
    : { originalOptions: currentOptions, freeChangesUsed: 0 };

  try {
    await redis.set(key, JSON.stringify(newSession), 'EX', SESSION_TTL_SECONDS);
  } catch (err) {
    logger.warn({ msg: 'Failed to store plan session in Redis', userId, err });
  }
}
