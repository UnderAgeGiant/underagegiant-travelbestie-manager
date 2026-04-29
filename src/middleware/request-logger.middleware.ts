import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../lib/logger';

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.flowId = randomUUID();
  const start = Date.now();
  // Capture here — req.path mutates as Express descends into sub-routers
  const { method } = req;
  const path = req.originalUrl.split('?')[0];

  logger.info({ flowId: req.flowId, method, path, msg: '→ request' });

  res.on('finish', () => {
    const ms = Date.now() - start;
    const entry = { flowId: req.flowId, method, path, status: res.statusCode, ms, msg: '← response' };
    if (res.statusCode >= 500) {
      logger.error(entry);
    } else {
      logger.info(entry);
    }
  });

  next();
}
