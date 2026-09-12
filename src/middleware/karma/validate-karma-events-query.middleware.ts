import { Request, Response, NextFunction } from 'express';
import { respondError } from '../../lib/respond-error';
import { decodeKarmaEventsCursor } from '../../lib/karma-events-cursor';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export function validateKarmaEventsQuery(req: Request, res: Response, next: NextFunction): void {
  let limit = DEFAULT_LIMIT;
  if (typeof req.query.limit === 'string') {
    const parsed = Number.parseInt(req.query.limit, 10);
    if (Number.isFinite(parsed)) limit = Math.min(Math.max(parsed, 1), MAX_LIMIT);
  }

  let cursor = null;
  if (typeof req.query.cursor === 'string' && req.query.cursor.length > 0) {
    cursor = decodeKarmaEventsCursor(req.query.cursor);
    if (!cursor) {
      respondError(req, res, 400, { error: 'Invalid cursor' });
      return;
    }
  }

  req.karmaEventsQuery = { cursor, limit };
  next();
}
