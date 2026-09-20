import { Router } from 'express';
import { TripController }  from '../controllers/trip.controller';
import { StatsController } from '../controllers/stats.controller';
import { respond }         from '../middleware/respond.middleware';
import { stripOwnerPii }   from '../middleware/trips/strip-owner-pii.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { validateFeedQuery }   from '../middleware/feed/validate-feed-query.middleware';

export function createFeaturedRouter(trip: TripController): Router {
  const router = Router();
  router.get('/', trip.findManyFeatured, stripOwnerPii, respond(200));
  return router;
}

export function createFeedRouter(trip: TripController): Router {
  const router = Router();
  router.get('/',
    rateLimitMiddleware({ keyPrefix: 'rl:feed', windowSeconds: 60, maxRequests: 60 }),
    validateFeedQuery,
    trip.listFeed,
    respond(200),
  );
  return router;
}

export function createStatsRouter(stats: StatsController): Router {
  const router = Router();
  router.get('/', stats.get, respond(200));
  return router;
}
