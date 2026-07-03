import { Request, Response, NextFunction } from 'express';
import { IKarmaPurchaseRepository } from '../repositories/interfaces/karma-purchase.repository';
import { createPayPalOrder, capturePayPalOrder } from '../lib/paypal';
import { findPackage, KARMA_PACKAGES } from '../lib/karma-packages';
import type { CreateOrderBody } from '../schemas/karma.schemas';

export class KarmaPurchaseController {
  constructor(private readonly purchases: IKarmaPurchaseRepository) {}

  getPackages = (req: Request, _res: Response, next: NextFunction): void => {
    req.result = { packages: KARMA_PACKAGES };
    next();
  };

  createOrder = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { packageId } = req.body as CreateOrderBody;
      const pkg = findPackage(packageId)!; // already validated by middleware

      // PayPal-specific: create the order via PayPal REST API
      const providerOrderId = await createPayPalOrder(pkg.price, packageId);

      // Store intent with provider-neutral fields
      await this.purchases.createPurchaseIntent(
        req.user!.userId,
        'paypal',        // provider name — change to 'mercadopago' in MercadoPago controller
        providerOrderId,
        packageId,
        pkg.karma,
        pkg.price,
        pkg.currency,
      );

      req.result = { orderID: providerOrderId };
      next();
    } catch (err) { next(err); }
  };

  captureOrder = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const purchase = req.karmaPurchase!; // set by verifyPurchaseOwnership middleware

      // PayPal-specific: capture the payment via PayPal REST API
      const { captureId } = await capturePayPalOrder(purchase.providerOrderId);

      const { purchase: completed, newKarmaTotal } =
        await this.purchases.completePurchase(purchase.providerOrderId, captureId);

      req.karmaPurchase = completed;
      req.result = { karma: newKarmaTotal, karmaAdded: purchase.karmaAmount };
      next();
    } catch (err) { next(err); }
  };
}
