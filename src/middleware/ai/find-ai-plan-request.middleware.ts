import { Request, Response, NextFunction } from 'express';
import { IAiPlanRequestRepository } from '../../repositories/interfaces/ai-plan-request.repository';

export function makeFindAiPlanRequest(repo: IAiPlanRequestRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.aiPlanRequest = (await repo.findById(req.params.requestId)) ?? undefined;
      next();
    } catch (err) { next(err); }
  };
}
