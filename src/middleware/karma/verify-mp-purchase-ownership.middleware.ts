import { Request, Response, NextFunction } from 'express';
import { IKarmaPurchaseRepository } from '../../repositories/interfaces/karma-purchase.repository';

/**
 * Read-only sibling of verify-purchase-ownership.middleware.ts — used by the MP
 * status-polling endpoint. Unlike the PayPal capture-order check, this does NOT
 * reject a non-'pending' status (the frontend keeps polling after completion to
 * see it), and it shapes req.result itself since there's no separate controller
 * for this simple a read.
 */
export function createVerifyMpPurchaseOwnership(repo: IKarmaPurchaseRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { purchaseRef } = req.params;
      const purchase = await repo.findByOrderId(purchaseRef);
      if (!purchase || purchase.userId !== req.user!.userId) {
        const err = Object.assign(new Error('Purchase not found'), { status: 404 });
        return next(err);
      }

      req.result = {
        status: purchase.status,
        ...(purchase.status === 'completed' ? { karmaAdded: purchase.karmaAmount } : {}),
      };
      next();
    } catch (err) { next(err); }
  };
}
