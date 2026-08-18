import { Request, Response, NextFunction } from 'express';
import { respondError } from '../../lib/respond-error';

const TYPE_PATTERN = /^[a-z0-9_]{1,64}$/;

export function validateHighlightType(req: Request, res: Response, next: NextFunction): void {
  if (!TYPE_PATTERN.test(req.params.type)) {
    respondError(req, res, 400, { error: 'INVALID_HIGHLIGHT_TYPE' });
    return;
  }
  next();
}
