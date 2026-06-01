import { Router } from 'express';
import { TripController } from '../controllers/trip.controller';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { respond } from '../middleware/respond.middleware';

export function createSharedRouter(trip: TripController): Router {
  const router = Router();

  router.get('/',
    rateLimitMiddleware({ keyPrefix: 'rl:shared_search', windowSeconds: 60, maxRequests: 30 }),
    trip.searchShared,
    respond(200),
  );

  router.get('/:shareId',
    rateLimitMiddleware({ keyPrefix: 'rl:shared_get', windowSeconds: 60, maxRequests: 60 }),
    trip.findByShareId,
    respond(200),
  );

  return router;
}
