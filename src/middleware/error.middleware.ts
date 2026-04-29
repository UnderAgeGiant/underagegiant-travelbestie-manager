import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

interface HttpError extends Error { status?: number; }

export function errorHandler(err: HttpError, req: Request, res: Response, _next: NextFunction): void {
  const status = err.status ?? 500;
  const message = status < 500 ? err.message : 'Internal server error';
  if (status >= 500) {
    logger.error({ flowId: req.flowId, method: req.method, path: req.originalUrl, msg: err.message, stack: err.stack });
  }
  res.status(status).json({ error: message });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found' });
}
