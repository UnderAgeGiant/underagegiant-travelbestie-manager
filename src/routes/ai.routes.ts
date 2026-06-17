import { Router, RequestHandler } from 'express';
import { AiController }    from '../controllers/ai.controller';
import { KarmaController } from '../controllers/karma.controller';
import { requireAuth }     from '../middleware/auth/require-auth.middleware';
import { validate }        from '../middleware/validate.middleware';
import { respond }         from '../middleware/respond.middleware';
import { checkPlanChange }              from '../middleware/ai/check-plan-change.middleware';
import { storePlanSession }             from '../middleware/ai/store-plan-session.middleware';
import { appendPlanChangeInfo }         from '../middleware/ai/append-plan-change-info.middleware';
import { createChargeAiPlanMiddleware } from '../middleware/ai/charge-ai-plan.middleware';
import { logCtaEvent } from '../lib/log-event';

export function createAiRouter(ai: AiController, karma: KarmaController): Router {
  const router = Router();

  router.use(requireAuth);

  router.post('/suggest',
    validate({ preferences: { required: true, type: 'string', minLength: 1 } }),
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
    validate({
      preferences:    { required: true, type: 'string', minLength: 1 },
      selectedOption: { required: true },
    }),
    checkPlanChange,                   // reads Redis, sets req.planChangeResult
    requireKarmaForAiPlanIfNeeded,     // 402 if insufficient karma (skipped for free_change)
    chargeAiPlanIfNeeded,              // deducts 1 karma unless free_change
    ai.plan,                           // calls DeepSeek, sets req.result
    storePlanSession,                  // writes/updates Redis session
    appendPlanChangeInfo,              // merges changeInfo into req.result
    logCtaEvent('cta_ai_plan', req => ({ changeType: req.planChangeResult?.type })),
    respond(200),
  );

  return router;
}
