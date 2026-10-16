import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';
import { resolveUserKey } from './request-identity';
import { readAnonymousId } from './highlight-identity';
import { capture } from './analytics';

export function logEvent(req: Request, name: string, meta: Record<string, unknown> = {}): void {
  logger.info({ event: name, flowId: req.flowId, userId: req.user?.userId ?? null, userKey: resolveUserKey(req), ...meta });
  // req.user is unset on login/register/refresh (auth hasn't happened yet) — foundUser is the acting user there.
  capture(req.user?.userId ?? req.foundUser?.id ?? readAnonymousId(req), name, meta);
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
