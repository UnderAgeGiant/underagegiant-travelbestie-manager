import { randomUUID } from 'crypto';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { saveRun, takeRun, runRejection, runnerTiersFor, PERSISTENT_MIN_MS, FinishRunBody, GameRun } from '../../lib/game';
import { redis } from '../../lib/redis';
import { rankingsKey, myRankingsKey } from '../../lib/rankings';
import { respondError } from '../../lib/respond-error';
import { exposeNewTrophies } from '../../lib/trophies';
import { TrophyRecorder } from '../../lib/trophy-recorder';
import { EarnedTrophy, FinishRunResponse } from '../../types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unavailable = { error: 'game_unavailable' };
const notFound = { error: 'run_not_found' };

/** Redis is the only place a run's start time lives — without it nothing can be validated, so 503. */
export async function startRun(req: Request, res: Response, next: NextFunction): Promise<void> {
  const runId = randomUUID();
  try { await saveRun(runId, req.user!.userId); }
  catch { respondError(req, res, 503, unavailable); return; }
  req.result = { runId };
  next();
}

/** Single-use claim. Someone else's run reads as not found (never confirm it exists). */
export async function claimRun(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { runId } = req.params;
  if (!UUID.test(runId)) { respondError(req, res, 404, notFound); return; }
  let run: GameRun | null;
  try { run = await takeRun(runId); }
  catch { respondError(req, res, 503, unavailable); return; }
  if (!run || run.userId !== req.user!.userId) { respondError(req, res, 404, notFound); return; }
  res.locals.gameRun = run;
  next();
}

export function checkRun(req: Request, res: Response, next: NextFunction): void {
  const reason = runRejection(req.body as FinishRunBody, (res.locals.gameRun as GameRun).startedAt, Date.now());
  if (reason) { respondError(req, res, 422, { error: 'invalid_run', reason }); return; }
  next();
}

/** A new weekly best must show on the board now, not within 2 h. Non-fatal. */
export async function bustRankings(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const r = req.result as FinishRunResponse;
  if (r.newRecord) {
    // ponytail: always drops the whole board on any personal record; check "≥ current #3" first if recompute load ever shows up.
    try { await redis.del(rankingsKey(r.weekStart), myRankingsKey(r.weekStart, req.user!.userId)); }
    catch { /* board catches up within RANKINGS_CACHE_TTL */ }
  }
  next();
}

/** runner: one event per score tier reached (lowest first). runner_persistent: one per ≥10 s run. recorder.record never throws. */
export function makeRecordGameTrophies(recorder?: TrophyRecorder): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (recorder) {
      const userId = req.user!.userId;
      const { score, durationMs } = req.body as FinishRunBody;
      const earned: EarnedTrophy[] = [];
      for (const tier of runnerTiersFor(score)) earned.push(...await recorder.record(userId, 'runner', tier));
      if (durationMs >= PERSISTENT_MIN_MS) earned.push(...await recorder.record(userId, 'runner_persistent', req.params.runId));
      exposeNewTrophies(res, earned);
    }
    next();
  };
}
