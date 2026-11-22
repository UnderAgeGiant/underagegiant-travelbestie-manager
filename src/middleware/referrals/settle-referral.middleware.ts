import { Request, Response, NextFunction, RequestHandler } from 'express';
import { IReferralRepository } from '../../repositories/interfaces/referral.repository';
import { INotificationRepository } from '../../repositories/interfaces/notification.repository';
import { settleReferral } from '../../lib/referrals';

/** F81: after a first plan is saved under the gift (mount with whenFirstPlan). settleReferral never throws. */
export function makeSettleReferral(referrals: IReferralRepository | undefined, notifications: INotificationRepository): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (referrals) await settleReferral({ referrals, notifications }, req.user!.userId, req.flowId);
    next();
  };
}
