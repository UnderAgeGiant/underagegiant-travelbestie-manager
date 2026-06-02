import { Router } from 'express';
import { TripController } from '../controllers/trip.controller';
import { KarmaController } from '../controllers/karma.controller';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { prepareSharedClone } from '../middleware/trips/prepare-shared-clone.middleware';
import { buildTripResponse } from '../middleware/trips/build-trip-response.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { respond } from '../middleware/respond.middleware';

export function createSharedRouter(trip: TripController, karma: KarmaController): Router {
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

  router.post('/:shareId/clone',
    requireAuth,
    trip.findByShareId,
    prepareSharedClone,
    karma.requireForTrip,
    trip.create,
    karma.spend,
    buildTripResponse,
    respond(201),
  );

  return router;
}
