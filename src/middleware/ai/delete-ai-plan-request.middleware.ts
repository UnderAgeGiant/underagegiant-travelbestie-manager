import { Request, Response, NextFunction } from 'express';
import { IAiPlanRequestRepository } from '../../repositories/interfaces/ai-plan-request.repository';

/**
 * Deletes or discards the row already resolved onto req.aiPlanRequest by
 * find-ai-plan-request.middleware.ts + checkAiPlanRequestOwnership, both of
 * which run earlier in this route's chain — by the time this runs the row is
 * confirmed to exist and belong to the caller, so this can't 404 or affect
 * someone else's row. Which repository method it calls depends on the row's
 * own status — see IAiPlanRequestRepository.delete()/.discard() (Task 26).
 */
export function makeDeleteAiPlanRequest(repo: IAiPlanRequestRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { requestId, status } = req.aiPlanRequest!;
      const userId = req.user!.userId;
      // A failed row is worth keeping for later failure analysis
      // (error_message) — soft-delete it instead of destroying it. Every
      // other status (completed, or in principle pending — see the route
      // comment below) has nothing left to analyze, so it hard-deletes
      // exactly as before.
      if (status === 'failed') {
        await repo.discard(requestId, userId);
      } else {
        await repo.delete(requestId, userId);
      }
      next();
    } catch (err) { next(err); }
  };
}
