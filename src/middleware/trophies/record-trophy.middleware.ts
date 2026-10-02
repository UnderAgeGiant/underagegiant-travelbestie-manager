import { Request, Response, NextFunction, RequestHandler } from 'express';
import { TrophyRecorder } from '../../lib/trophy-recorder';
import { exposeNewTrophies } from '../../lib/trophies';
import { logger } from '../../lib/logger';
import { TrophyType } from '../../types';

export type TrophyTarget = { userId: string; refId: string; scopeId?: string; celebrate: boolean } | null;
export type TrophyTargetFn = (req: Request, recorder: TrophyRecorder) => TrophyTarget | Promise<TrophyTarget>;

/**
 * Records one trophy event for whoever `target` resolves. celebrate=true means the
 * recipient is the caller, so newly earned trophies go back on X-New-Trophies.
 * No-op when no recorder is wired (tests). Never blocks the response.
 */
export function makeRecordTrophy(recorder: TrophyRecorder | undefined, type: TrophyType, target: TrophyTargetFn): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (recorder) {
      try {
        const t = await target(req, recorder);
        if (t) {
          const earned = await recorder.record(t.userId, type, t.refId, t.scopeId);
          if (t.celebrate) exposeNewTrophies(res, earned);
        }
      } catch (err) {
        logger.warn({ msg: 'trophy hook failed', flowId: req.flowId, type, error: (err as Error).message });
      }
    }
    next();
  };
}
