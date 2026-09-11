import { Request, Response, NextFunction } from 'express';

/**
 * MercadoPago sends notifications for topics we never act on (merchant_order,
 * chargebacks, point_integration_wh, subscription events, etc.) to the same
 * notification_url as real payment events. Some of these arrive via MercadoPago's
 * legacy IPN mechanism (?topic=<x>&id=<n> query params, no JSON body) — which
 * MercadoPago's own documentation confirms cannot be signature-validated against
 * an application secret, even though it carries an x-signature-shaped header.
 *
 * Requiring a valid signature for a notification type we were never going to act
 * on anyway accomplishes nothing security-wise and only generates repeated
 * failed-delivery noise (and risks MercadoPago's delivery-health tracking flagging
 * the endpoint). Ack any non-'payment' topic immediately, before spending a
 * signature check — and before processMpWebhook would otherwise try to treat a
 * merchant_order/other resource ID as if it were a payment ID.
 *
 * A real payment notification always identifies itself, either via the legacy
 * ?topic=payment query param or the modern JSON body's "type": "payment" field —
 * this only short-circuits when one of those is present and says something else.
 * No topic/type specified at all falls through unchanged, so this can't
 * accidentally start dropping payment notifications in some as-yet-unseen shape.
 */
export function filterMpNotificationTopic(req: Request, res: Response, next: NextFunction): void {
  const topic = (req.query['topic'] as string | undefined) ?? (req.body as { type?: string } | undefined)?.type;
  if (topic && topic !== 'payment') {
    res.status(200).json({ received: true });
    return;
  }
  next();
}
