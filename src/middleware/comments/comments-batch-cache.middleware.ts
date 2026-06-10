import { Request, Response, NextFunction } from 'express';
import { redis, commentCacheKey, COMMENT_CACHE_TTL } from '../../lib/redis';
import { Comment } from '../../types';
import { logger } from '../../lib/logger';

function parseIds(req: Request): string[] {
  const raw = req.query.ids;
  if (!raw || typeof raw !== 'string') return [];
  return [...new Set(raw.split(',').map(s => s.trim()).filter(Boolean))];
}

export async function readCommentsBatchCache(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const ids = parseIds(req);
  if (ids.length === 0) { next(); return; }

  try {
    const keys = ids.map(commentCacheKey);
    const values = await redis.mget(...keys);
    const allHit = values.every(v => v !== null);
    if (allHit) {
      const result: Record<string, Comment[]> = {};
      ids.forEach((id, i) => { result[id] = JSON.parse(values[i]!); });
      res.status(200).json(result);
      return;
    }
  } catch (err) {
    logger.warn({ flowId: req.flowId, msg: 'Redis unavailable in readCommentsBatchCache; falling through to DB', err });
  }
  next();
}

export async function writeCommentsBatchCache(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = req.result as Record<string, Comment[]>;
    const pipeline = redis.pipeline();
    for (const [id, comments] of Object.entries(result)) {
      pipeline.set(commentCacheKey(id), JSON.stringify(comments), 'EX', COMMENT_CACHE_TTL);
    }
    await pipeline.exec();
  } catch (err) {
    logger.warn({ flowId: req.flowId, msg: 'Redis unavailable in writeCommentsBatchCache; skipping cache write', err });
  }
  next();
}
