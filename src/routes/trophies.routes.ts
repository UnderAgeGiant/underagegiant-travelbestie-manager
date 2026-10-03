import { Router, Request } from 'express';
import { ITrophyRepository } from '../repositories/interfaces/trophy.repository';
import { TripController } from '../controllers/trip.controller';
import { TrophyRecorder } from '../lib/trophy-recorder';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { makeGetTrophies } from '../middleware/trophies/get-trophies.middleware';
import { makeRecordTrophy } from '../middleware/trophies/record-trophy.middleware';
import { shareTarget } from '../middleware/trophies/trophy-targets';
import { respond } from '../middleware/respond.middleware';

const byUser = (req: Request): string => req.user?.userId ?? req.ip ?? 'unknown';

export function createTrophiesRouter(trophyRepo: ITrophyRepository, trip: TripController, recorder: TrophyRecorder): Router {
  const router = Router();

  router.get('/',
    requireAuth,
    rateLimitMiddleware({ keyPrefix: 'rl:trophies', windowSeconds: 60, maxRequests: 60, getKey: byUser }),
    makeGetTrophies(trophyRepo),
    respond(200),
  );

  // Client-reported: the browser can't tell which app the native share sheet used, so the
  // frontend reports a completed share. Spoofable — accepted for a one-off badge; rate-limited.
  router.post('/share/:shareId',
    requireAuth,
    rateLimitMiddleware({ keyPrefix: 'rl:trophies-share', windowSeconds: 3600, maxRequests: 20, getKey: byUser }),
    trip.findByShareId,                                  // 404 for an unknown shareId
    makeRecordTrophy(recorder, 'share_plan', shareTarget),
    respond(204),
  );

  return router;
}
