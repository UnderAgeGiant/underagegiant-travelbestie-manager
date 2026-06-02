import { Request, Response, NextFunction } from 'express';
import { redis, commentLastTextKey } from '../../lib/redis';
import { computeTextChangeRatio, COMMENT_SIMILARITY_THRESHOLD } from '../../lib/text-similarity';
import { logger } from '../../lib/logger';

export async function checkCommentSimilarity(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const lastText = await redis.get(commentLastTextKey(req.user!.userId));
    if (lastText) {
      const newText = ((req.body.text as string) ?? '').trim();
      if (computeTextChangeRatio(newText, lastText) < COMMENT_SIMILARITY_THRESHOLD) {
        res.status(409).json({ error: 'TOO_SIMILAR' });
        return;
      }
    }
  } catch (err) {
    logger.warn({ flowId: req.flowId, msg: 'Redis unavailable in checkCommentSimilarity; skipping', err });
  }
  next();
}
