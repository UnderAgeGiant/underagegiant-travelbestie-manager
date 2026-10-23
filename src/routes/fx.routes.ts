import { Router } from 'express';
import { FxController } from '../controllers/fx.controller';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { respond } from '../middleware/respond.middleware';

export function createFxRouter(fx: FxController): Router {
  const router = Router();

  router.get('/rates',
    rateLimitMiddleware({ keyPrefix: 'rl:fx', windowSeconds: 60, maxRequests: 120 }),
    fx.rates,
    respond(200),
  );

  return router;
}
