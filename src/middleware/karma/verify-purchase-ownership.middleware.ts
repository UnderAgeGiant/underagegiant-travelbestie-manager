import { Request, Response, NextFunction } from 'express';
import { IKarmaPurchaseRepository } from '../../repositories/interfaces/karma-purchase.repository';

export function createVerifyPurchaseOwnership(repo: IKarmaPurchaseRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orderID } = req.body as { orderID?: string };
      if (!orderID) {
        const err = Object.assign(new Error('orderID is required'), { status: 400 });
        return next(err);
      }

      const purchase = await repo.findByOrderId(orderID);
      if (!purchase || purchase.userId !== req.user!.userId) {
        const err = Object.assign(new Error('Purchase not found'), { status: 404 });
        return next(err);
      }
      if (purchase.status !== 'pending') {
        const err = Object.assign(new Error('Purchase already processed'), { status: 409 });
        return next(err);
      }

      req.karmaPurchase = purchase;
      next();
    } catch (err) { next(err); }
  };
}
