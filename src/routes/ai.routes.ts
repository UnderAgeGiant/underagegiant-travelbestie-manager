import { Router } from 'express';
import { AiController } from '../controllers/ai.controller';
import { KarmaController } from '../controllers/karma.controller';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { respond } from '../middleware/respond.middleware';

export function createAiRouter(ai: AiController, karma: KarmaController): Router {
  const router = Router();

  router.use(requireAuth);

  router.post('/suggest',
    validate({ preferences: { required: true, type: 'string', minLength: 1 } }),
    karma.spendForAiSuggest,
    ai.suggest,
    respond(200),
  );

  router.post('/plan',
    validate({
      preferences:    { required: true, type: 'string', minLength: 1 },
      selectedOption: { required: true },
    }),
    karma.spendForAiPlan,
    ai.plan,
    respond(200),
  );

  return router;
}
