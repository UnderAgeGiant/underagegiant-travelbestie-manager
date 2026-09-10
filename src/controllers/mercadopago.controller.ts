import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { IKarmaPurchaseRepository } from '../repositories/interfaces/karma-purchase.repository';
import { createMpPreference } from '../lib/mercadopago';
import { findPackage } from '../lib/karma-packages';
import type { CreateOrderBody } from '../schemas/karma.schemas';

export class MercadoPagoController {
  constructor(private readonly purchases: IKarmaPurchaseRepository) {}

  createPreference = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { packageId } = req.body as CreateOrderBody;
      const pkg = findPackage(packageId)!; // already validated by validateKarmaPackage middleware
      const priceClp = pkg.prices['CLP'];

      // Our own reference — MercadoPago's preference_id doesn't exist until after this call,
      // but external_reference must be set at creation time. See Global Constraints in the plan.
      const purchaseRef = `mp_${randomUUID()}`;

      const { preferenceId, initPoint } = await createMpPreference(priceClp, packageId, purchaseRef);

      await this.purchases.createPurchaseIntent(
        req.user!.userId,
        'mercadopago',
        purchaseRef,
        packageId,
        pkg.karma,
        priceClp,
        'CLP',
      );

      req.result = { preferenceId, initPoint };
      next();
    } catch (err) { next(err); }
  };
}
