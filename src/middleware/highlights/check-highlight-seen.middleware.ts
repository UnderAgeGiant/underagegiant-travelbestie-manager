import { Request, Response, NextFunction } from 'express';
import { redis, highlightSeenKey } from '../../lib/redis';
import { highlightIdentity } from '../../lib/highlight-identity';
import { IHighlightRepository } from '../../repositories/interfaces/highlight.repository.interface';
import { logger } from '../../lib/logger';

export function makeCheckHighlightSeen(repo: IHighlightRepository) {
  return async function checkHighlightSeen(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const type = req.params.type;
    const identity = highlightIdentity(req);
    const key = highlightSeenKey(type, identity);

    try {
      const cached = await redis.get(key);
      if (cached) {
        res.status(200).json({ seen: true });
        return;
      }
    } catch (err) {
      logger.warn({ flowId: req.flowId, msg: 'Redis unavailable in checkHighlightSeen; falling through', err });
    }

    if (!req.user) {
      res.status(200).json({ seen: false });
      return;
    }

    try {
      const seen = await repo.hasSeen(req.user.userId, type);
      if (seen) {
        try { await redis.set(key, '1'); } catch { /* non-fatal — DB remains authoritative */ }
      }
      res.status(200).json({ seen });
    } catch (err) {
      logger.warn({ flowId: req.flowId, msg: 'DB unavailable in checkHighlightSeen; failing open', err });
      res.status(200).json({ seen: false });
    }
  };
}
