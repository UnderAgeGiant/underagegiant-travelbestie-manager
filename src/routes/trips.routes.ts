import { Router } from 'express';
import { TripController } from '../controllers/trip.controller';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { checkTripOwnership } from '../middleware/trips/check-trip-ownership.middleware';
import { buildTripResponse } from '../middleware/trips/build-trip-response.middleware';
import { makeApplyKarmaOnTrip } from '../middleware/trips/apply-karma-on-trip.middleware';
import { respond } from '../middleware/respond.middleware';
import { IKarmaRepository } from '../repositories/interfaces/karma.repository';

export function createTripsRouter(trip: TripController, karmaRepo: IKarmaRepository): Router {
  const router = Router();
  const applyKarmaOnTrip = makeApplyKarmaOnTrip(karmaRepo);

  router.use(requireAuth);

  router.get('/',
    trip.findByOwner,
    respond(200)
  );

  router.post('/',
    validate({ title: { required: true, minLength: 1 }, stops: { required: true } }),
    trip.create,
    applyKarmaOnTrip,
    buildTripResponse,
    respond(201)
  );

  router.put('/:id',
    trip.findById,
    checkTripOwnership,
    trip.update,
    buildTripResponse,
    respond(200)
  );

  router.delete('/:id',
    trip.findById,
    checkTripOwnership,
    trip.delete,
    respond(204)
  );

  return router;
}
