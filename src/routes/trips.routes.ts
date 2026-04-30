import { Router } from 'express';
import { TripController } from '../controllers/trip.controller';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { checkTripOwnership } from '../middleware/trips/check-trip-ownership.middleware';
import { buildTripResponse } from '../middleware/trips/build-trip-response.middleware';
import { respond } from '../middleware/respond.middleware';

export function createTripsRouter(trip: TripController): Router {
  const router = Router();

  router.use(requireAuth);

  router.get('/',
    trip.findByOwner,
    respond(200),
  );

  router.post('/',
    validate({ title: { required: true, minLength: 1 }, stops: { required: true } }),
    trip.create,
    buildTripResponse,
    respond(201),
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

  return router;
}
