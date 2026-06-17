import { Router } from 'express';
import { TripController } from '../controllers/trip.controller';
import { KarmaController } from '../controllers/karma.controller';
import { IFavoriteRepository } from '../repositories/interfaces/favorite.repository.interface';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { optionalAuth } from '../middleware/auth/optional-auth.middleware';
import { prepareSharedClone } from '../middleware/trips/prepare-shared-clone.middleware';
import { buildTripResponse } from '../middleware/trips/build-trip-response.middleware';
import { makeFavoriteToggle } from '../middleware/favorites/favorite.toggle.middleware';
import { makeAttachFavoriteMeta } from '../middleware/favorites/attach-favorite-meta.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { respond } from '../middleware/respond.middleware';
import { logCtaEvent } from '../lib/log-event';

export function createSharedRouter(
  trip: TripController,
  karma: KarmaController,
  favoriteRepo: IFavoriteRepository,
): Router {
  const router = Router();
  const favoriteToggle     = makeFavoriteToggle(favoriteRepo);
  const attachFavoriteMeta = makeAttachFavoriteMeta(favoriteRepo);

  router.get('/',
    rateLimitMiddleware({ keyPrefix: 'rl:shared:search', windowSeconds: 60, maxRequests: 30 }),
    trip.searchShared,
    respond(200),
  );

  router.get('/:shareId',
    rateLimitMiddleware({ keyPrefix: 'rl:shared:get', windowSeconds: 60, maxRequests: 60 }),
    optionalAuth,
    trip.findByShareId,
    attachFavoriteMeta,
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
    logCtaEvent('cta_trip_clone', req => ({ sourceShareId: req.params.shareId, newTripId: (req.result as { id?: string } | undefined)?.id })),
    respond(201),
  );

  router.post('/:shareId/favorite',
    requireAuth,
    trip.findByShareId,
    favoriteToggle,
    logCtaEvent('cta_favorite_toggle', req => ({ tripId: req.params.shareId, favorited: (req.result as { favorited?: boolean } | undefined)?.favorited })),
    respond(200),
  );

  return router;
}
