import { Router, RequestHandler } from 'express';
import { AiController }    from '../controllers/ai.controller';
import { KarmaController } from '../controllers/karma.controller';
import { requireAuth }     from '../middleware/auth/require-auth.middleware';
import { validateBody }    from '../middleware/validate-body.middleware';
import { aiSuggestSchema, aiPlanSchema, aiSuggestAttractionsSchema, suggestCompanionSchema } from '../schemas/ai.schemas';
import type { AiSuggestAttractionsBody, SuggestCompanionBody } from '../schemas/ai.schemas';
import type { CompanionSuggestion } from '../types';
import { respond }         from '../middleware/respond.middleware';
import { checkPlanChange }              from '../middleware/ai/check-plan-change.middleware';
import { storePlanSession }             from '../middleware/ai/store-plan-session.middleware';
import { appendPlanChangeInfo }         from '../middleware/ai/append-plan-change-info.middleware';
import { createChargeAiPlanMiddleware } from '../middleware/ai/charge-ai-plan.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { rollCompanionSuggestion } from '../middleware/ai/roll-companion-suggestion.middleware';
import { COMPANION_SUGGEST_RATE_LIMIT } from '../lib/companion-suggest';
import { logCtaEvent } from '../lib/log-event';

export function createAiRouter(ai: AiController, karma: KarmaController): Router {
  const router = Router();

  router.use(requireAuth);

  router.post('/suggest',
    validateBody(aiSuggestSchema),
    karma.requireKarma(9),
    karma.spendForAiSuggest,
    ai.suggest,
    logCtaEvent('cta_ai_suggest', () => ({ karmaSpent: 9 })),
    respond(200),
  );

  const chargeAiPlanIfNeeded = createChargeAiPlanMiddleware(karma);

  const requireKarmaForAiPlanIfNeeded: RequestHandler = (req, res, next) => {
    if (req.planChangeResult?.type === 'free_change') return next();
    return karma.requireKarma(1)(req, res, next);
  };

  router.post('/plan',
    validateBody(aiPlanSchema),
    checkPlanChange,                   // reads Redis, sets req.planChangeResult
    requireKarmaForAiPlanIfNeeded,     // 402 if insufficient karma (skipped for free_change)
    chargeAiPlanIfNeeded,              // deducts 1 karma unless free_change
    ai.plan,                           // calls DeepSeek, sets req.result
    storePlanSession,                  // writes/updates Redis session
    appendPlanChangeInfo,              // merges changeInfo into req.result
    logCtaEvent('cta_ai_plan', req => ({ changeType: req.planChangeResult?.type })),
    respond(200),
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
