import { Request, Response, NextFunction } from 'express';
import { IKarmaPurchaseRepository } from '../../repositories/interfaces/karma-purchase.repository';
import { fetchMpPayment } from '../../lib/mercadopago';
import { logger } from '../../lib/logger';
import { completeMpPurchaseIfAmountMatches } from './complete-mp-purchase';

/**
 * Resolves a MercadoPago payment notification to a karma_purchases row and
 * completes/fails it. Always calls next() with req.result set (never a 4xx/5xx
 * for a condition we can anticipate) so the route always acks with 200 and
 * MercadoPago's retry loop doesn't hammer us for a purchase we've already
 * handled or don't recognize. A genuine failure (network/DB error) is left to
 * propagate via next(err) so MP *does* retry — swallowing that would silently
 * drop a payment that was never credited.
 */
export function createProcessMpWebhook(purchases: IKarmaPurchaseRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as { data?: { id?: string } };
      const paymentId =
        body.data?.id ??
        (req.query['data.id'] as string | undefined) ??
        (req.query['id'] as string | undefined);

      if (!paymentId) {
        req.result = { received: true };
        return next();
      }

      const payment = await fetchMpPayment(paymentId);
      const purchase = await purchases.findByOrderId(payment.externalReference);

      if (!purchase || purchase.status !== 'pending') {
        logger.info({
          msg: 'mp webhook: no-op (unknown or already-processed purchase)',
          flowId: req.flowId, paymentId, externalReference: payment.externalReference,
          found: !!purchase, status: purchase?.status,
        });
        req.result = { received: true };
        return next();
      }

      if (payment.status === 'approved') {
        // completeMpPurchaseIfAmountMatches never credits karma for a payment whose
        // transactionAmount doesn't match this purchase's stored amount — a tampering
        // attempt or an MP-integration anomaly instead fails the purchase and this route
        // still acks 200 (this won't resolve on retry, so it belongs with the other
        // anticipated-condition no-ops, not a 5xx).
        const { purchase: updated, newKarmaTotal } =
          await completeMpPurchaseIfAmountMatches(purchases, purchase, { id: paymentId, transactionAmount: payment.transactionAmount });
        if (updated.status === 'completed') {
          req.karmaPurchase = updated;
          req.result = { karma: newKarmaTotal, karmaAdded: updated.karmaAmount };
        } else {
          req.result = { received: true };
        }
      } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
        await purchases.failPurchase(purchase.providerOrderId, payment.status);
        req.result = { received: true };
      } else {
        // still pending on MP's side (e.g. a bank transfer awaiting clearance) — nothing
        // to do yet; MP will send another notification once it resolves.
        req.result = { received: true };
      }
      next();
    } catch (err) { next(err); }
  };
}
