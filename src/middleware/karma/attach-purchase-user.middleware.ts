import { Request, Response, NextFunction } from 'express';
import { IUserRepository } from '../../repositories/interfaces/user.repository';

/**
 * The MercadoPago webhook carries no JWT, so req.user is never set by requireAuth.
 * sendKarmaConfirmationEmailMiddleware / makeNotifyKarmaPurchase / logCtaEvent all
 * read req.user — this looks the buyer up by req.karmaPurchase.userId (set by
 * processMpWebhook on a completed purchase) so those three middleware run
 * unmodified on the webhook route too. No-ops when there's no completed purchase
 * to attach a user to.
 */
export function createAttachPurchaseUser(users: IUserRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.karmaPurchase && !req.user) {
        const user = await users.findById(req.karmaPurchase.userId);
        if (user) {
          req.user = { userId: user.id, email: user.email, name: user.name };
        }
      }
      next();
    } catch (err) { next(err); }
  };
}
