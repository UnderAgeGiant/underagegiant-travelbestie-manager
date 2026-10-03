import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ITrophyRepository } from '../../repositories/interfaces/trophy.repository';
import { exposeNewTrophies } from '../../lib/trophies';
import { logger } from '../../lib/logger';

/**
 * The AI plan runs in the background, so its trophy can't ride on POST /ai/plan.
 * When the status poll first sees 'completed', expose any ai_plans tiers earned since
 * the request was created. Repeats on later polls are deduped by the frontend.
 */
export function makeAttachAiPlanTrophies(repo?: ITrophyRepository): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const record = req.aiPlanRequest;
    if (repo && record?.status === 'completed' && record.karmaCharged > 0) {
      try {
        exposeNewTrophies(res, await repo.listEarnedSince(record.userId, 'ai_plans', record.createdAt));
      } catch (err) {
        logger.warn({ msg: 'ai plan trophy lookup failed', flowId: req.flowId, error: (err as Error).message });
      }
    }
    next();
  };
}
