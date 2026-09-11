import { Request, Response, NextFunction } from 'express';
import { IKarmaPurchaseRepository } from '../../repositories/interfaces/karma-purchase.repository';
import { KarmaPurchase } from '../../types';
import { searchMpPayments, fetchMpPayment } from '../../lib/mercadopago';
import { completeMpPurchaseIfAmountMatches } from './complete-mp-purchase';
import { logger } from '../../lib/logger';

/**
 * Read-only sibling of verify-purchase-ownership.middleware.ts — used by the MP
 * status-polling endpoint. Unlike the PayPal capture-order check, this does NOT
 * reject a non-'pending' status (the frontend keeps polling after completion to
 * see it), and it shapes req.result itself since there's no separate controller
 * for this simple a read.
 */

// Only treat "no payment record found" as a genuine abandonment once the purchase has
// been pending at least this long — protects against a client polling immediately after
// create-preference, before the user has even reached MercadoPago's checkout page, from
// being prematurely marked failed. A found rejected/cancelled/approved payment is NOT
// gated by this — MercadoPago has already made that determination, so it's safe to act
// on right away.
const MP_RECONCILE_MIN_PENDING_AGE_MS = 10_000;

/**
 * Self-heals a MercadoPago purchase stuck 'pending' when the webhook never fired — e.g.
 * the user abandoned MercadoPago's hosted checkout without ever submitting payment details,
 * or the webhook call itself never reached us (misconfigured notification_url, delivery
 * failure, etc.) even for a genuinely approved payment. Called lazily on each status poll
 * rather than on a schedule.
 *
 * An approved payment found this way is completed through the exact same
 * completeMpPurchaseIfAmountMatches() the webhook uses, so the amount-tampering guard can
 * never be bypassed just because the webhook happened to miss this purchase. Fails open
 * (leaves the purchase pending) on any MercadoPago API error, since this runs on every
 * poll and a transient failure must not break the next one.
 */
export async function reconcilePendingMpPurchase(
  purchases: IKarmaPurchaseRepository,
  purchase: KarmaPurchase,
): Promise<KarmaPurchase> {
  if (purchase.status !== 'pending') return purchase;

  let results: Array<{ id: string; status: string }>;
  try {
    results = await searchMpPayments(purchase.providerOrderId);
  } catch (err) {
    logger.warn({
      msg: 'mp reconcile: search API call failed, leaving purchase pending',
      providerOrderId: purchase.providerOrderId, err: (err as Error).message,
    });
    return purchase;
  }

  const latest = results[0];

  if (latest) {
    if (latest.status === 'rejected' || latest.status === 'cancelled') {
      logger.info({
        msg: 'mp reconcile: found a rejected/cancelled payment the webhook never reported',
        providerOrderId: purchase.providerOrderId, paymentStatus: latest.status,
      });
      await purchases.failPurchase(purchase.providerOrderId, latest.status);
      return (await purchases.findByOrderId(purchase.providerOrderId))!;
    }

    if (latest.status === 'approved') {
      let payment: { transactionAmount: number };
      try {
        payment = await fetchMpPayment(latest.id);
      } catch (err) {
        logger.warn({
          msg: 'mp reconcile: fetching approved payment details failed, leaving purchase pending',
          providerOrderId: purchase.providerOrderId, paymentId: latest.id, err: (err as Error).message,
        });
        return purchase;
      }
      logger.info({
        msg: 'mp reconcile: found an approved payment the webhook never reported — completing it',
        providerOrderId: purchase.providerOrderId, paymentId: latest.id,
      });
      const { purchase: updated } =
        await completeMpPurchaseIfAmountMatches(purchases, purchase, { id: latest.id, transactionAmount: payment.transactionAmount });
      return updated;
    }

    return purchase; // in_process / authorized / etc. — still genuinely pending, leave it
  }

  const ageMs = Date.now() - new Date(purchase.createdAt).getTime();
  if (ageMs < MP_RECONCILE_MIN_PENDING_AGE_MS) return purchase;

  logger.info({
    msg: 'mp reconcile: no payment record ever created after minimum wait — marking abandoned',
    providerOrderId: purchase.providerOrderId, ageMs,
  });
  await purchases.failPurchase(purchase.providerOrderId, 'abandoned');
  return (await purchases.findByOrderId(purchase.providerOrderId))!;
}

export function createVerifyMpPurchaseOwnership(repo: IKarmaPurchaseRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { purchaseRef } = req.params;
      let purchase = await repo.findByOrderId(purchaseRef);
      if (!purchase || purchase.userId !== req.user!.userId) {
        const err = Object.assign(new Error('Purchase not found'), { status: 404 });
        return next(err);
      }

      const wasPending = purchase.status === 'pending';
      purchase = await reconcilePendingMpPurchase(repo, purchase);

      if (wasPending && purchase.status === 'completed') {
        // Just self-healed to completed in this exact call — let the route chain's
        // confirmation-email/notification/CTA-logging middleware fire, same as the webhook.
        req.karmaPurchase = purchase;
      }

      req.result = {
        status: purchase.status,
        ...(purchase.status === 'completed' ? { karmaAdded: purchase.karmaAmount } : {}),
      };
      next();
    } catch (err) { next(err); }
  };
}
