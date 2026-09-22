import { Router } from 'express';
import { TripController } from '../controllers/trip.controller';
import { respond } from '../middleware/respond.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { respondSeoSummary } from '../middleware/seo/respond-seo-summary.middleware';
import { validateSeoCityId } from '../middleware/seo/validate-seo-city-id.middleware';

/** Machine-facing endpoints for the frontend's Vercel functions (crawler head + sitemap). Public, PII-free. */
export function createSeoRouter(trip: TripController): Router {
  const router = Router();
  router.get('/sitemap',
    rateLimitMiddleware({ keyPrefix: 'rl:seo-sitemap', windowSeconds: 60, maxRequests: 30 }),
    trip.seoSitemap,
    respond(200),
  );
  router.get('/shared/:shareId',
    rateLimitMiddleware({ keyPrefix: 'rl:seo-shared', windowSeconds: 60, maxRequests: 300 }),
    trip.seoShared,
    respondSeoSummary,
    respond(200),
  );
  router.get('/city/:cityId/plans',
    rateLimitMiddleware({ keyPrefix: 'rl:seo-city-plans', windowSeconds: 60, maxRequests: 120 }),
    validateSeoCityId,
    trip.seoCityPlans,
    respond(200),
  );
  return router;
}
