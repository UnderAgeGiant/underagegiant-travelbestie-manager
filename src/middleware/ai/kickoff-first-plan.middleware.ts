import { Request, Response, NextFunction, RequestHandler } from 'express';
import { waitUntil } from '@vercel/functions';
import { AiController } from '../../controllers/ai.controller';
import { IKarmaRepository } from '../../repositories/interfaces/karma.repository';
import { IUserRepository } from '../../repositories/interfaces/user.repository';
import { ITripRepository } from '../../repositories/interfaces/trip.repository';
import { IAiPlanRequestRepository } from '../../repositories/interfaces/ai-plan-request.repository';
import { INotificationRepository } from '../../repositories/interfaces/notification.repository';
import { IReferralRepository } from '../../repositories/interfaces/referral.repository';
import { runAiPlanJob } from '../../lib/ai-plan-job';
import { buildCitiesPlanOption } from '../../lib/cities-plan-option';
import { AiFirstPlanBody, AiPlanBody } from '../../schemas/ai.schemas';

/**
 * F79 POST /ai/first-plan fast phase: synthesizes the option the plan prompt expects, inserts a
 * 'pending' row (karma_charged 0, firstRun) and schedules the job that saves the trip itself.
 * Contracts §5.5. Runs after requireFirstPlanClaim, so the gift is already held.
 */
export function createKickoffFirstPlanMiddleware(
  ai:             AiController,
  karma:          IKarmaRepository,
  users:          IUserRepository,
  trips:          ITripRepository,
  aiPlanRequests: IAiPlanRequestRepository,
  notifications:  INotificationRepository,
  referrals?:     IReferralRepository,
): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { cities, duration, startDate, preferences, cityCatalog } = req.body as AiFirstPlanBody;
      const cityIds = cities.map(c => c.id);
      const selectedOption = buildCitiesPlanOption(cities, duration);
      const body: AiPlanBody = { selectedOption, preferences, duration, startDate, cityCatalog, cityIds };

      const record = await aiPlanRequests.insert({
        requestId:     req.aiPlanRequestId!,
        userId:        req.user!.userId,
        planSessionId: '',
        karmaCharged:  0,
        requestParams: { selectedOption, preferences: preferences ?? '', duration, startDate, cityIds, firstRun: true },
      });

      waitUntil(runAiPlanJob(
        { ai, aiPlanRequests, karma, notifications, users, trips, referrals },
        {
          requestId: record.requestId, userId: req.user!.userId, flowId: req.flowId, body,
          planChangeResult: { type: 'new_session' }, karmaCharged: 0, firstPlan: { cityIds },
        },
      ));

      req.result = { requestId: record.requestId };
      next();
    } catch (err) { next(err); }
  };
}
