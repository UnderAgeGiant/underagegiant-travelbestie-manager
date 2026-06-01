import { Request, Response, NextFunction } from 'express';
import { redis, commentCooldownKey, commentLastTextKey } from '../../lib/redis';
import { COMMENT_COOLDOWN_SECONDS } from './check-comment-cooldown.middleware';
import { logger } from '../../lib/logger';

const LAST_TEXT_TTL = 300; // 5 min — outlasts the cooldown window

export async function storeCommentRedis(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const text   = ((req.body.text as string) ?? '').trim();
    const now    = Math.floor(Date.now() / 1000).toString();
    await Promise.all([
      redis.set(commentCooldownKey(userId),  now,  'EX', COMMENT_COOLDOWN_SECONDS),
      redis.set(commentLastTextKey(userId),  text, 'EX', LAST_TEXT_TTL),
    ]);
  } catch (err) {
    logger.warn({ flowId: req.flowId, msg: 'Redis unavailable in storeCommentRedis; skipping', err });
  }
  next();
}
