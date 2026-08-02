import { Router } from 'express';
import { CompanionController } from '../controllers/companion.controller';
import { KarmaController }     from '../controllers/karma.controller';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { respond }     from '../middleware/respond.middleware';
import { logCtaEvent } from '../lib/log-event';

export function createCompanionRouter(companion: CompanionController, karma: KarmaController): Router {
  const router = Router();

  router.use(requireAuth);

  router.get('/status', companion.status, respond(200));

  router.post('/boost',
    karma.requireKarma(2),
    karma.spendForCompanionBoost,
    companion.boost,
    logCtaEvent('cta_companion_boost', () => ({ karmaSpent: 2 })),
    respond(200),
  );

  return router;
}
