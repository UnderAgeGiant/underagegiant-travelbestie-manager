import { Router } from 'express';
import { KarmaController } from '../controllers/karma.controller';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { respond } from '../middleware/respond.middleware';

export function createKarmaRouter(karma: KarmaController): Router {
  const router = Router();

  router.get('/',
    requireAuth,
    karma.get,
    respond(200)
  );

  return router;
}
