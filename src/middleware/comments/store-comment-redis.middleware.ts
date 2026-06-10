import { Request, Response, NextFunction } from 'express';
import { redis, commentCooldownKey, commentLastTextKey, commentCacheKey, COMMENT_CACHE_TTL } from '../../lib/redis';
import { COMMENT_COOLDOWN_SECONDS } from './check-comment-cooldown.middleware';
import { Comment } from '../../types';
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

    const cacheKey = commentCacheKey(req.params.attractionId);
    const existing = await redis.get(cacheKey);

    const writes: Promise<unknown>[] = [
      redis.set(commentCooldownKey(userId), now,  'EX', COMMENT_COOLDOWN_SECONDS),
      redis.set(commentLastTextKey(userId), text, 'EX', LAST_TEXT_TTL),
    ];

    if (existing !== null) {
      const cached: Comment[] = JSON.parse(existing);
      const updated = [req.result as Comment, ...cached];
      writes.push(redis.set(cacheKey, JSON.stringify(updated), 'EX', COMMENT_CACHE_TTL));
    }

    await Promise.all(writes);
  } catch (err) {
    logger.warn({ flowId: req.flowId, msg: 'Redis unavailable in storeCommentRedis; skipping', err });
  }
  next();
}
