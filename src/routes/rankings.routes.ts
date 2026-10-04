import { Router, Request } from 'express';
import { RankingController } from '../controllers/ranking.controller';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { respond } from '../middleware/respond.middleware';

const byUser = (req: Request): string => req.user?.userId ?? req.ip ?? 'unknown';
const limit = rateLimitMiddleware({ keyPrefix: 'rl:rankings', windowSeconds: 60, maxRequests: 60, getKey: byUser });

export function createRankingsRouter(ctrl: RankingController): Router {
  const router = Router();
  router.get('/',   requireAuth, limit, ctrl.weekly, respond(200));
  router.get('/me', requireAuth, limit, ctrl.mine,   respond(200));
  return router;
}
