import { Request, Response, NextFunction } from 'express';
import { waitUntil } from '@vercel/functions';
import { AiController } from '../../controllers/ai.controller';
import { IKarmaRepository } from '../../repositories/interfaces/karma.repository';
import { IAiPlanRequestRepository } from '../../repositories/interfaces/ai-plan-request.repository';
import { INotificationRepository } from '../../repositories/interfaces/notification.repository';
import { runAiPlanJob } from '../../lib/ai-plan-job';
import { AiPlanBody } from '../../schemas/ai.schemas';

/**
 * Fast phase of POST /ai/plan: persists a 'pending' ai_plan_requests row,
 * kicks off the actual DeepSeek generation in the background via waitUntil()
 * (survives even if the client disconnects — same pattern as the
 * fire-and-forget emails in src/middleware/**\/send-*-email.middleware.ts),
 * and sets req.result to just the new row's id. The route responds 202;
 * the frontend polls GET /ai/plan/:requestId/status for the eventual result.
 */
export function createKickoffAiPlanMiddleware(
  ai:            AiController,
  karma:         IKarmaRepository,
  aiPlanRequests: IAiPlanRequestRepository,
  notifications: INotificationRepository,
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as AiPlanBody;
      const planChangeResult = req.planChangeResult!;
      const karmaCharged = planChangeResult.type === 'free_change' ? 0 : 1;

      const record = await aiPlanRequests.insert({
        userId:        req.user!.userId,
        planSessionId: body.planSessionId ?? '',
        karmaCharged,
        requestParams: {
          selectedOption: body.selectedOption,
          preferences:    body.preferences,
          duration:       body.duration,
          budget:         body.budget,
          startDate:      body.startDate,
        },
      });

      waitUntil(
        runAiPlanJob(
          { ai, aiPlanRequests, karma, notifications },
          {
            requestId: record.requestId,
            userId:    req.user!.userId,
            flowId:    req.flowId,
            body,
            planChangeResult,
            karmaCharged,
          },
        ),
      );

      req.result = { requestId: record.requestId };
      next();
    } catch (err) { next(err); }
  };
}
