import { Request, Response, NextFunction } from 'express';
import { alias } from '../../lib/analytics';
import { readAnonymousId } from '../../lib/highlight-identity';

/** Links the browser's pre-login anonymous id to the account in analytics. */
export function aliasAnonymousUser(req: Request, _res: Response, next: NextFunction): void {
  alias(readAnonymousId(req), req.foundUser?.id ?? null);
  next();
}
