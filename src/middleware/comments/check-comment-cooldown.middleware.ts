import { Request, Response, NextFunction } from 'express';
import { redis, commentCooldownKey } from '../../lib/redis';
import { logger } from '../../lib/logger';
import { respondError } from '../../lib/respond-error';

export const COMMENT_COOLDOWN_SECONDS = 60;

export async function checkCommentCooldown(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const raw = await redis.get(commentCooldownKey(req.user!.userId));
    if (raw) {
      const postedAt   = parseInt(raw, 10);
      const elapsed    = Math.floor(Date.now() / 1000) - postedAt;
      const retryAfter = Math.max(1, COMMENT_COOLDOWN_SECONDS - elapsed);
      respondError(req, res, 429, { error: 'TOO_SOON', retryAfterSeconds: retryAfter });
      return;
    }
  } catch (err) {
    logger.warn({ flowId: req.flowId, msg: 'Redis unavailable in checkCommentCooldown; skipping', err });
  }
  next();
}
