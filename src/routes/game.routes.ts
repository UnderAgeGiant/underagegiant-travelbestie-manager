import { Router, Request } from 'express';
import { GameController } from '../controllers/game.controller';
import { TrophyRecorder } from '../lib/trophy-recorder';
import { logCtaEvent } from '../lib/log-event';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { validateBody } from '../middleware/validate-body.middleware';
import { respond } from '../middleware/respond.middleware';
import { startRun, claimRun, checkRun, bustRankings, makeRecordGameTrophies } from '../middleware/game/game-run.middleware';
import { finishRunSchema } from '../schemas/game.schemas';
import { FinishRunResponse } from '../types';

const byUser = (req: Request): string => req.user?.userId ?? req.ip ?? 'unknown';
const limit = rateLimitMiddleware({ keyPrefix: 'rl:game', windowSeconds: 3600, maxRequests: 120, getKey: byUser });

export function createGameRouter(ctrl: GameController, recorder?: TrophyRecorder): Router {
  const router = Router();
  router.post('/runs', requireAuth, limit, startRun, respond(201));
  router.post('/runs/:runId/finish',
    requireAuth, limit, validateBody(finishRunSchema),
    claimRun, checkRun,
    ctrl.saveBest,
    bustRankings,
    makeRecordGameTrophies(recorder),
    logCtaEvent('game_run_finished', req => {
      const r = req.result as FinishRunResponse;
      return { score: r.score, durationMs: req.body.durationMs, newRecord: r.newRecord };
    }),
    respond(200),
  );
  return router;
}
