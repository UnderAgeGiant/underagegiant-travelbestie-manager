import { Router, RequestHandler } from 'express';
import { AiController }    from '../controllers/ai.controller';
import { KarmaController, KARMA_COST_AI_SUGGEST } from '../controllers/karma.controller';
import { IKarmaRepository } from '../repositories/interfaces/karma.repository';
import { IAiPlanRequestRepository } from '../repositories/interfaces/ai-plan-request.repository';
import { INotificationRepository } from '../repositories/interfaces/notification.repository';
import { requireAuth }     from '../middleware/auth/require-auth.middleware';
import { validateBody }    from '../middleware/validate-body.middleware';
import { aiSuggestSchema, aiPlanSchema, aiSuggestAttractionsSchema, suggestCompanionSchema } from '../schemas/ai.schemas';
import type { AiSuggestAttractionsBody, SuggestCompanionBody } from '../schemas/ai.schemas';
import type { CompanionSuggestion } from '../types';
import { respond }         from '../middleware/respond.middleware';
import { checkPlanChange }                  from '../middleware/ai/check-plan-change.middleware';
import { generateAiPlanRequestId }          from '../middleware/ai/generate-ai-plan-request-id.middleware';
import { createChargeAiPlanMiddleware }     from '../middleware/ai/charge-ai-plan.middleware';
import { createKickoffAiPlanMiddleware }    from '../middleware/ai/kickoff-ai-plan.middleware';
import { makeFindAiPlanRequest }        from '../middleware/ai/find-ai-plan-request.middleware';
import { checkAiPlanRequestOwnership }  from '../middleware/ai/check-ai-plan-request-ownership.middleware';
import { aiPlanStatusResponse }         from '../middleware/ai/ai-plan-status-response.middleware';
import { makeListAiPlanHistory }        from '../middleware/ai/list-ai-plan-history.middleware';
import { makeDeleteAiPlanRequest }      from '../middleware/ai/delete-ai-plan-request.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { rollCompanionSuggestion } from '../middleware/ai/roll-companion-suggestion.middleware';
import { COMPANION_SUGGEST_RATE_LIMIT } from '../lib/companion-suggest';
import { logCtaEvent } from '../lib/log-event';

export function createAiRouter(
  ai:            AiController,
  karma:         KarmaController,
  karmaRepo:     IKarmaRepository,
  aiPlanRequests: IAiPlanRequestRepository,
  notifications: INotificationRepository,
): Router {
  const router = Router();

  router.use(requireAuth);

  router.post('/suggest',
    validateBody(aiSuggestSchema),
    karma.requireKarma(KARMA_COST_AI_SUGGEST),
    karma.spendForAiSuggest,
    ai.suggest,
    logCtaEvent('cta_ai_suggest', () => ({ karmaSpent: KARMA_COST_AI_SUGGEST })),
    respond(200),
  );

  const chargeAiPlanIfNeeded = createChargeAiPlanMiddleware(karma);

  const requireKarmaForAiPlanIfNeeded: RequestHandler = (req, res, next) => {
    if (req.planChangeResult?.type === 'free_change') return next();
    return karma.requireKarma(1)(req, res, next);
  };

  const kickoffAiPlan = createKickoffAiPlanMiddleware(ai, karmaRepo, aiPlanRequests, notifications);

  // Fast phase only — the actual DeepSeek call runs in the background (see
  // kickoff-ai-plan.middleware.ts / src/lib/ai-plan-job.ts). Responds 202 with
  // just a requestId; the frontend polls the /status route below.
  router.post('/plan',
    validateBody(aiPlanSchema),
    checkPlanChange,                   // reads Redis, sets req.planChangeResult
    generateAiPlanRequestId,           // req.aiPlanRequestId — shared by the charge and the insert below
    requireKarmaForAiPlanIfNeeded,     // 402 if insufficient karma (skipped for free_change)
    chargeAiPlanIfNeeded,              // deducts 1 karma unless free_change; ref_id = req.aiPlanRequestId
    kickoffAiPlan,                     // inserts 'pending' row using the same id, schedules the background job
    respond(202),
  );

  // Registered before the /:requestId route below — Express matches by full
  // path shape, not registration order, but 'history' as a literal segment
  // here can never collide with the /:requestId/status pattern (3 segments).
  router.get('/plan/history',
    makeListAiPlanHistory(aiPlanRequests),
    respond(200),
  );

  router.get('/plan/:requestId/status',
    makeFindAiPlanRequest(aiPlanRequests),
    checkAiPlanRequestOwnership,       // 404 if missing or not owned by the caller
    aiPlanStatusResponse,
    respond(200),
  );

  // Deletes (completed rows) or soft-deletes (failed rows — see Task 26) one
  // ai_plan_requests row — called automatically by the frontend right after
  // AiPlanningComponent.save() persists a plan, and manually via the
  // "Descartar" button on a failed card (which can never be saved). Reuses
  // the same find/ownership pair as the status route above.
  router.delete('/plan/:requestId',
    makeFindAiPlanRequest(aiPlanRequests),
    checkAiPlanRequestOwnership,
    makeDeleteAiPlanRequest(aiPlanRequests),
    respond(204),
  );

  const requireKarmaForCitySuggestIfNeeded: RequestHandler = (req, res, next) => {
    if ((req.body as AiSuggestAttractionsBody).isFollowUp === true) return next();
    return karma.requireKarma(2)(req, res, next);
  };

  const spendForCitySuggestIfNeeded: RequestHandler = (req, res, next) => {
    if ((req.body as AiSuggestAttractionsBody).isFollowUp === true) return next();
    return karma.spendForCitySuggest(req, res, next);
  };

  router.post('/suggest-attractions',
    validateBody(aiSuggestAttractionsSchema),
    requireKarmaForCitySuggestIfNeeded,
    spendForCitySuggestIfNeeded,
    ai.suggestCityAttractions,
    logCtaEvent('cta_ai_city_suggest', req => ({
      cityId: (req.body as AiSuggestAttractionsBody).cityId,
      karmaSpent: (req.body as AiSuggestAttractionsBody).isFollowUp ? 0 : 2,
    })),
    respond(200),
  );

  router.post('/suggest-companion',
    validateBody(suggestCompanionSchema),
    rateLimitMiddleware({
      keyPrefix:     'rl:companion-suggest',
      windowSeconds: 3600,
      maxRequests:   COMPANION_SUGGEST_RATE_LIMIT,
      getKey:        req => req.user!.userId,
    }),
    rollCompanionSuggestion,   // 204 short-circuit on a dice-roll miss
    ai.suggestCompanion,       // 204 short-circuit on an invalid/colliding suggestion
    logCtaEvent('cta_companion_suggest_shown', req => ({
      cityId:               (req.body as SuggestCompanionBody).cityId,
      addedAttractionId:    (req.body as SuggestCompanionBody).addedAttractionId,
      suggestedAttractionId: (req.result as CompanionSuggestion).attractionId,
    })),
    respond(200),
  );

  return router;
}
