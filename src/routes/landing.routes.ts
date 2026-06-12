import { Router } from 'express';
import { TripController }  from '../controllers/trip.controller';
import { StatsController } from '../controllers/stats.controller';
import { respond }         from '../middleware/respond.middleware';

export function createFeaturedRouter(trip: TripController): Router {
  const router = Router();
  router.get('/', trip.findManyFeatured, respond(200));
  return router;
}

export function createStatsRouter(stats: StatsController): Router {
  const router = Router();
  router.get('/', stats.get, respond(200));
  return router;
}
