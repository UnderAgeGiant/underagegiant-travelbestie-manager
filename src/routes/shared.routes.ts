import { Router, RequestHandler, ErrorRequestHandler } from 'express';
import { TripController } from '../controllers/trip.controller';
import { KarmaController } from '../controllers/karma.controller';
import { IFavoriteRepository } from '../repositories/interfaces/favorite.repository.interface';
import { INotificationRepository } from '../repositories/interfaces/notification.repository';
import { TrophyRecorder } from '../lib/trophy-recorder';
import { makeRecordTrophy } from '../middleware/trophies/record-trophy.middleware';
import { favoriteTarget, cloneTarget, visitTarget } from '../middleware/trophies/trophy-targets';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { optionalAuth } from '../middleware/auth/optional-auth.middleware';
import { prepareSharedClone } from '../middleware/trips/prepare-shared-clone.middleware';
import { buildTripResponse } from '../middleware/trips/build-trip-response.middleware';
import { makeFavoriteToggle } from '../middleware/favorites/favorite.toggle.middleware';
import { makeAttachFavoriteMeta } from '../middleware/favorites/attach-favorite-meta.middleware';
import { captureSharedTripMeta } from '../middleware/notifications/capture-shared-trip-meta.middleware';
import { stripOwnerPii } from '../middleware/trips/strip-owner-pii.middleware';
import { makeNotifyFavorite } from '../middleware/notifications/notify-favorite.middleware';
import { makeNotifyClone } from '../middleware/notifications/notify-clone.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { respond } from '../middleware/respond.middleware';
import { logCtaEvent } from '../lib/log-event';
import { IUserRepository } from '../repositories/interfaces/user.repository';
import { makeClaimFirstPlanIfAvailable } from '../middleware/first-plan/claim-first-plan-if-available.middleware';
import { makeReleaseFirstPlanOnError } from '../middleware/first-plan/release-first-plan-on-error.middleware';
import { unlessFirstPlan, whenFirstPlan } from '../middleware/first-plan/unless-first-plan';

export function createSharedRouter(
  trip: TripController,
  karma: KarmaController,
  favoriteRepo: IFavoriteRepository,
  notificationRepo: INotificationRepository,
  trophies?: TrophyRecorder,
  // F79. Optional only because it follows `trophies`; without it nobody claims the gift and the clone is paid.
  userRepo?: IUserRepository,
): Router {
  const router = Router();
  const claimFirstPlan: RequestHandler = userRepo ? makeClaimFirstPlanIfAvailable(userRepo) : (_req, _res, next) => next();
  const releaseFirstPlanOnError: ErrorRequestHandler = userRepo ? makeReleaseFirstPlanOnError(userRepo) : (err, _req, _res, next) => next(err);
  const favoriteToggle     = makeFavoriteToggle(favoriteRepo);
  const attachFavoriteMeta = makeAttachFavoriteMeta(favoriteRepo);
  const notifyFavorite     = makeNotifyFavorite(notificationRepo);
  const notifyClone        = makeNotifyClone(notificationRepo);

  router.get('/',
    rateLimitMiddleware({ keyPrefix: 'rl:shared:search', windowSeconds: 60, maxRequests: 30 }),
    trip.searchShared,
    stripOwnerPii,
    respond(200),
  );

  router.get('/:shareId',
    rateLimitMiddleware({ keyPrefix: 'rl:shared:get', windowSeconds: 60, maxRequests: 60 }),
    optionalAuth,
    trip.findByShareId,
    makeRecordTrophy(trophies, 'plan_visited', visitTarget),   // must run before stripOwnerPii (needs ownerId)
    attachFavoriteMeta,
    stripOwnerPii,
    respond(200),
  );

  router.post('/:shareId/clone',
    requireAuth,
    trip.findByShareId,
    captureSharedTripMeta,
    prepareSharedClone,
    claimFirstPlan,
    unlessFirstPlan(karma.requireForTrip),
    trip.create,
    releaseFirstPlanOnError,
    unlessFirstPlan(karma.spendForTripCreated),
    buildTripResponse,
    logCtaEvent('cta_trip_clone', req => ({ sourceShareId: req.params.shareId, newTripId: (req.result as { id?: string } | undefined)?.id })),
    whenFirstPlan(logCtaEvent('cta_first_plan_saved', req => ({ path: req.query.source === 'featured' ? 'featured_copy' : 'shared_copy', tripId: req.trip!.id }))),
    notifyClone,
    makeRecordTrophy(trophies, 'clones', cloneTarget),
    respond(201),
  );

  router.post('/:shareId/favorite',
    requireAuth,
    trip.findByShareId,
    captureSharedTripMeta,
    favoriteToggle,
    logCtaEvent('cta_favorite_toggle', req => ({ tripId: req.params.shareId, favorited: (req.result as { favorited?: boolean } | undefined)?.favorited })),
    notifyFavorite,
    makeRecordTrophy(trophies, 'favorites', favoriteTarget),
    respond(200),
  );

  return router;
}
