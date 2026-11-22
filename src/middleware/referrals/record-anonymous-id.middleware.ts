import { Request, Response, NextFunction, RequestHandler } from 'express';
import { IReferralRepository } from '../../repositories/interfaces/referral.repository';
import { readAnonymousId } from '../../lib/highlight-identity';
import { logger } from '../../lib/logger';

/** F81 (contracts §19.4): remembers the browser ids a user registered, logged in or refreshed with. Non-fatal. */
export function makeRecordAnonymousId(repo?: IReferralRepository): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const anonymousId = readAnonymousId(req);
    if (!repo || !anonymousId || !req.foundUser) return next();
    try {
      await repo.recordAnonymousId(req.foundUser.id, anonymousId);
    } catch (err) {
      logger.warn({ msg: 'Failed to record the anonymous id', userId: req.foundUser.id, err });
    }
    next();
  };
}
