import { Request, Response, NextFunction } from 'express';
import { IAiPlanRequestRepository } from '../../repositories/interfaces/ai-plan-request.repository';

/** GET /ai/plan/history — the caller's completed/failed rows, shaped the same way as the status endpoint (error, not errorMessage). */
export function makeListAiPlanHistory(repo: IAiPlanRequestRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const records = await repo.listByUser(req.user!.userId);
      req.result = records.map(r => ({
        requestId:     r.requestId,
        status:        r.status,
        requestParams: r.requestParams,
        result:        r.result,
        error:         r.errorMessage,
        karmaCharged:  r.karmaCharged,
        createdAt:     r.createdAt,
        completedAt:   r.completedAt,
      }));
      next();
    } catch (err) { next(err); }
  };
}
