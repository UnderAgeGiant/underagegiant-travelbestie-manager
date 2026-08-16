import { Request, Response, NextFunction } from 'express';
import { redis, highlightSeenKey } from '../../lib/redis';
import { highlightIdentity } from '../../lib/highlight-identity';
import { IHighlightRepository } from '../../repositories/interfaces/highlight.repository.interface';
import { logger } from '../../lib/logger';

export function makeMarkHighlightSeen(repo: IHighlightRepository) {
  return async function markHighlightSeen(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const type = req.params.type;
    const identity = highlightIdentity(req);

    try {
      await redis.set(highlightSeenKey(type, identity), '1');
    } catch (err) {
      logger.warn({ flowId: req.flowId, msg: 'Redis unavailable in markHighlightSeen; continuing', err });
    }

    if (req.user) {
      try {
        await repo.markSeen(req.user.userId, type);
      } catch (err) {
        logger.warn({ flowId: req.flowId, msg: 'DB write failed in markHighlightSeen; Redis/cookie still remember it', err });
      }
    }

    next();
  };
}
