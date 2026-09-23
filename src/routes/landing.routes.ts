import { Router, Request } from 'express';
import { TripController }  from '../controllers/trip.controller';
import { StatsController } from '../controllers/stats.controller';
import { respond }         from '../middleware/respond.middleware';
import { stripOwnerPii }   from '../middleware/trips/strip-owner-pii.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { validateFeedQuery }   from '../middleware/feed/validate-feed-query.middleware';
import { requireAuth }         from '../middleware/auth/require-auth.middleware';

export function createFeaturedRouter(trip: TripController): Router {
  const router = Router();
  router.get('/', trip.findManyFeatured, stripOwnerPii, respond(200));
  return router;
}

// Per-user key (limiter runs after requireAuth) — same helper as notifications.routes.ts.
// IP keying would 429 every user behind shared NAT whose combined polling exceeds the limit.
const byUser = (req: Request): string => req.user?.userId ?? req.ip ?? 'unknown';

export function createFeedRouter(trip: TripController): Router {
  const router = Router();
  router.get('/',
    requireAuth,
    rateLimitMiddleware({ keyPrefix: 'rl:feed', windowSeconds: 60, maxRequests: 60, getKey: byUser }),
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
