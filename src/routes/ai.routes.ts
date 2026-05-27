import { Router } from 'express';
import { AiController }    from '../controllers/ai.controller';
import { KarmaController } from '../controllers/karma.controller';
import { requireAuth }     from '../middleware/auth/require-auth.middleware';
import { validate }        from '../middleware/validate.middleware';
import { respond }         from '../middleware/respond.middleware';
import { checkPlanChange }              from '../middleware/ai/check-plan-change.middleware';
import { storePlanSession }             from '../middleware/ai/store-plan-session.middleware';
import { appendPlanChangeInfo }         from '../middleware/ai/append-plan-change-info.middleware';
import { createChargeAiPlanMiddleware } from '../middleware/ai/charge-ai-plan.middleware';

export function createAiRouter(ai: AiController, karma: KarmaController): Router {
  const router = Router();

  router.use(requireAuth);

  router.post('/suggest',
    validate({ preferences: { required: true, type: 'string', minLength: 1 } }),
    karma.spendForAiSuggest,
    ai.suggest,
    respond(200),
  );

  const chargeAiPlanIfNeeded = createChargeAiPlanMiddleware(karma);

  router.post('/plan',
    validate({
      preferences:    { required: true, type: 'string', minLength: 1 },
      selectedOption: { required: true },
    }),
    checkPlanChange,           // reads Redis, sets req.planChangeResult
    chargeAiPlanIfNeeded,      // deducts 1 karma unless free_change
    ai.plan,                   // calls DeepSeek, sets req.result
    storePlanSession,          // writes/updates Redis session
    appendPlanChangeInfo,      // merges changeInfo into req.result
    respond(200),
  );

  return router;
}
