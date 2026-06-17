import { Router, RequestHandler } from 'express';
import { TripController } from '../controllers/trip.controller';
import { KarmaController } from '../controllers/karma.controller';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { checkTripOwnership } from '../middleware/trips/check-trip-ownership.middleware';
import { buildTripResponse } from '../middleware/trips/build-trip-response.middleware';
import { generateItinerary } from '../middleware/trips/generate-itinerary.middleware';
import { prepareOwnedClone } from '../middleware/trips/prepare-owned-clone.middleware';
import { respond } from '../middleware/respond.middleware';
import { logCtaEvent } from '../lib/log-event';

// Wraps a middleware so it is skipped when the trip has already been exported.
function skipIfExported(fn: RequestHandler): RequestHandler {
  return (req, res, next) => req.trip?.itineraryExportedAt ? next() : fn(req, res, next);
}

export function createTripsRouter(trip: TripController, karma: KarmaController): Router {
  const router = Router();

  router.use(requireAuth);

  router.get('/',
    trip.findByOwner,
    respond(200),
  );

  router.post('/',
    validate({ title: { required: true, minLength: 1 }, stops: { required: true } }),
    karma.requireForTrip,
    trip.create,
    karma.spend,
    buildTripResponse,
    respond(201),
  );

  router.post('/:id/itinerary',
    trip.findById,
    checkTripOwnership,
    skipIfExported(karma.requireForTrip),
    skipIfExported(karma.spend),
    skipIfExported(trip.recordExport),
    generateItinerary,
  );

  router.put('/:id',
    trip.findById,
    checkTripOwnership,
    trip.update,
    buildTripResponse,
    respond(200),
  );

  router.delete('/:id',
    trip.findById,
    checkTripOwnership,
    trip.delete,
    respond(204),
  );

  router.post('/:id/share',
    trip.findById,
    checkTripOwnership,
    trip.shareIfAlreadyShared,
    karma.requireForTrip,
    trip.createShare,
    karma.spendForShare,
    logCtaEvent('cta_trip_share', req => ({ tripId: req.params.id })),
    respond(200),
  );

  router.post('/:id/clone',
    trip.findById,
    checkTripOwnership,
    prepareOwnedClone,
    karma.requireForTrip,
    trip.create,
    karma.spend,
    buildTripResponse,
    logCtaEvent('cta_trip_clone', req => ({ sourceTripId: req.params.id, newTripId: (req.result as { id?: string } | undefined)?.id })),
    respond(201),
  );

  return router;
}
