import { Request, Response, NextFunction } from 'express';
import { IKarmaPurchaseRepository } from '../../repositories/interfaces/karma-purchase.repository';
import { fetchMpPayment } from '../../lib/mercadopago';
import { logger } from '../../lib/logger';

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
        const expectedAmount = Number(purchase.amount);
        const paidAmount = payment.transactionAmount;
        const AMOUNT_TOLERANCE = 0.01; // guards against decimal round-trip noise, not a real discrepancy

        if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - expectedAmount) > AMOUNT_TOLERANCE) {
          // The amount MercadoPago actually charged doesn't match what this purchase was
          // created for — a tampering attempt or an MP-integration anomaly. Never credit
          // karma for this: fail the purchase and ack 200 (this won't resolve on retry,
          // so it belongs with the other anticipated-condition no-ops, not a 5xx).
          logger.error({
            msg: 'mp webhook: amount mismatch — refusing to credit karma',
            flowId: req.flowId, paymentId, externalReference: payment.externalReference,
            expectedAmount: purchase.amount, paidAmount: payment.transactionAmount,
          });
          await purchases.failPurchase(purchase.providerOrderId, 'amount_mismatch');
          req.result = { received: true };
          return next();
        }

        const { purchase: completed, newKarmaTotal } =
          await purchases.completePurchase(purchase.providerOrderId, paymentId);
        req.karmaPurchase = completed;
        req.result = { karma: newKarmaTotal, karmaAdded: completed.karmaAmount };
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
