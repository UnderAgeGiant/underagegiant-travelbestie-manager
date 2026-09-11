import { IKarmaPurchaseRepository } from '../../repositories/interfaces/karma-purchase.repository';
import { KarmaPurchase } from '../../types';
import { logger } from '../../lib/logger';

const AMOUNT_TOLERANCE = 0.01; // guards against decimal round-trip noise, not a real discrepancy

export interface MpCompletionResult {
  purchase: KarmaPurchase;
  newKarmaTotal?: number; // only set when this call actually completed the purchase just now
}

/**
 * Given a purchase already confirmed 'pending' and a MercadoPago payment already confirmed
 * 'approved', reconciles the paid amount against the stored purchase amount before crediting
 * karma. Shared by the webhook (process-mp-webhook.middleware.ts) and the status-poll
 * self-heal path (verify-mp-purchase-ownership.middleware.ts) so this tampering guard can
 * never drift out of sync between the two ways a purchase can get completed — a purchase
 * the webhook never reports (misconfigured notification_url, delivery failure, etc.) and
 * that only ever gets discovered by the self-heal poll must be just as protected against a
 * mismatched paid amount as one that goes through the webhook.
 */
export async function completeMpPurchaseIfAmountMatches(
  purchases: IKarmaPurchaseRepository,
  purchase: KarmaPurchase,
  payment: { id: string; transactionAmount: number },
): Promise<MpCompletionResult> {
  const expectedAmount = Number(purchase.amount);
  const paidAmount = payment.transactionAmount;

  if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - expectedAmount) > AMOUNT_TOLERANCE) {
    logger.error({
      msg: 'mp: amount mismatch — refusing to credit karma',
      providerOrderId: purchase.providerOrderId, paymentId: payment.id,
      expectedAmount: purchase.amount, paidAmount: payment.transactionAmount,
    });
    await purchases.failPurchase(purchase.providerOrderId, 'amount_mismatch');
    return { purchase: (await purchases.findByOrderId(purchase.providerOrderId))! };
  }

  const { purchase: completed, newKarmaTotal } =
    await purchases.completePurchase(purchase.providerOrderId, payment.id);
  return { purchase: completed, newKarmaTotal };
}
