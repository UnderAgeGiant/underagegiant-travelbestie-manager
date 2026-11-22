import { Request, Response, NextFunction } from 'express';
import { IReferralRepository } from '../repositories/interfaces/referral.repository';
import { REFERRAL_MONTHLY_CAP, REFERRAL_REWARD } from '../lib/referrals';

/** F81 /referrals (contracts §19.1–19.2). Thin: one repository call each, result onto req. */
export class ReferralController {
  constructor(private readonly referrals: IReferralRepository) {}

  code = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.referralCode = await this.referrals.getOrCreateCode(req.user!.userId);
      next();
    } catch (err) { next(err); }
  };

  summary = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const summary = await this.referrals.summary(req.user!.userId);
      req.result = { code: req.referralCode, ...summary, rewardTokens: REFERRAL_REWARD, monthCap: REFERRAL_MONTHLY_CAP };
      next();
    } catch (err) { next(err); }
  };

  findInviter = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.result = await this.referrals.findInviter(req.params.code);
      next();
    } catch (err) { next(err); }
  };
}
