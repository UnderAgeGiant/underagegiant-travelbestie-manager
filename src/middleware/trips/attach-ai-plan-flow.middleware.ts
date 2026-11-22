import { Request, Response, NextFunction, RequestHandler } from 'express';
import { IAiPlanRequestRepository } from '../../repositories/interfaces/ai-plan-request.repository';
import { logger } from '../../lib/logger';

/**
 * F84 analytics: tags an AI-sourced POST /trips with the flow ('simple' | 'advanced') of the
 * caller's own ai_plan_requests row, for `cta_trip_create`. Never fails the request.
 */
export function makeAttachAiPlanFlow(repo?: IAiPlanRequestRepository): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const requestId = req.body.sourceAiPlanRequestId as string | undefined;
    if (!repo || !requestId) return next();
    try {
      const row = await repo.findById(requestId);
      if (row && row.userId === req.user!.userId) req.aiPlanFlow = row.requestParams.flow ?? 'advanced';
    } catch (err) {
      logger.warn({ msg: 'Could not read the AI plan flow for cta_trip_create', requestId, err });
    }
    next();
  };
}
