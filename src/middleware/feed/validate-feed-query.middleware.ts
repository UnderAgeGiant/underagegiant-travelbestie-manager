import { Request, Response, NextFunction } from 'express';
import { respondError } from '../../lib/respond-error';
import { decodeFeedCursor } from '../../lib/feed-cursor';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 20;

export function validateFeedQuery(req: Request, res: Response, next: NextFunction): void {
  let limit = DEFAULT_LIMIT;
  if (typeof req.query.limit === 'string') {
    const parsed = Number.parseInt(req.query.limit, 10);
    if (Number.isFinite(parsed)) limit = Math.min(Math.max(parsed, 1), MAX_LIMIT);
  }

  let cursor = null;
  if (typeof req.query.cursor === 'string' && req.query.cursor.length > 0) {
    cursor = decodeFeedCursor(req.query.cursor);
    if (!cursor) {
      respondError(req, res, 400, { error: 'Invalid cursor' });
      return;
    }
  }

  req.feedQuery = { cursor, limit };
  next();
}
