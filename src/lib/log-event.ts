import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

export function logEvent(req: Request, name: string, meta: Record<string, unknown> = {}): void {
  logger.info({ event: name, flowId: req.flowId, userId: req.user?.userId ?? null, ...meta });
}

/** Route-chain step: logs a named CTA event and calls next(). */
export function logCtaEvent(
  name: string,
  metaFn?: (req: Request) => Record<string, unknown>,
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    logEvent(req, name, metaFn ? metaFn(req) : {});
    next();
  };
}
