import { Request, Response, NextFunction, RequestHandler } from 'express';
import { IReferralRepository } from '../../repositories/interfaces/referral.repository';
import { readAnonymousId } from '../../lib/highlight-identity';
import { logger } from '../../lib/logger';
import type { ReferralChannel } from '../../types';

/**
 * F81 register step (contracts §19.3): ties the new account to the owner of `referralCode`.
 * Runs before recordAnonymousId, so the new user's own browser id can't count as the referrer's.
 * Never fails the registration: an unknown/own code inserts nothing, an error is a warning.
 */
export function makeAttachReferral(repo?: IReferralRepository): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const code = req.body.referralCode as string | undefined;
    if (!repo || !code) return next();
    const channel: ReferralChannel = req.body.referralChannel ?? 'link';
    try {
      const attached = await repo.attach(req.foundUser!.id, code, channel, readAnonymousId(req));
      if (attached) req.referralAttribution = { channel, sameBrowser: attached.sameBrowser };
    } catch (err) {
      logger.warn({ msg: 'Referral attribution failed', userId: req.foundUser!.id, err });
    }
    next();
  };
}
