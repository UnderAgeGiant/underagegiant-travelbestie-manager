import { Router } from 'express';
import { TripController }  from '../controllers/trip.controller';
import { StatsController } from '../controllers/stats.controller';
import { respond }         from '../middleware/respond.middleware';

export function createLandingRouter(trip: TripController, stats: StatsController): Router {
  const router = Router();

  router.get('/featured', trip.findManyFeatured, respond(200));
  router.get('/stats',    stats.get,             respond(200));

  return router;
}
