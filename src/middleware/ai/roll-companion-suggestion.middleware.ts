import { Request, Response, NextFunction } from 'express';
import { redis } from '../../lib/redis';
import {
  companionBoostKey,
  COMPANION_SUGGEST_CHANCE_DEFAULT,
  COMPANION_SUGGEST_CHANCE_BOOSTED,
} from '../../lib/companion-suggest';

/** Probabilistically lets the request through to ai.suggestCompanion. On a miss,
 *  short-circuits with 204 (no body) — mirrors the readCommentsBatchCache pattern:
 *  respond directly and return, never call next(). Redis errors fall back to the
 *  default (non-boosted) chance rather than failing the request. */
export async function rollCompanionSuggestion(req: Request, res: Response, next: NextFunction): Promise<void> {
  let boosted = false;
  try {
    boosted = (await redis.get(companionBoostKey(req.user!.userId))) === '1';
  } catch {
    // Redis unavailable — fall back to the default chance
  }
  const chance = boosted ? COMPANION_SUGGEST_CHANCE_BOOSTED : COMPANION_SUGGEST_CHANCE_DEFAULT;
  if (Math.random() < chance) { next(); return; }
  res.status(204).send();
}
