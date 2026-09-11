import { Router, Request, Response, NextFunction } from 'express';
import { KarmaController } from '../controllers/karma.controller';
import { KarmaPurchaseController } from '../controllers/karma-purchase.controller';
import { MercadoPagoController } from '../controllers/mercadopago.controller';
import { IKarmaPurchaseRepository } from '../repositories/interfaces/karma-purchase.repository';
import { IUserRepository } from '../repositories/interfaces/user.repository';
import { INotificationRepository } from '../repositories/interfaces/notification.repository';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { validateBody } from '../middleware/validate-body.middleware';
import { createOrderSchema, captureOrderSchema } from '../schemas/karma.schemas';
import { validateKarmaPackage } from '../middleware/karma/validate-karma-package.middleware';
import { createVerifyPurchaseOwnership } from '../middleware/karma/verify-purchase-ownership.middleware';
import { sendKarmaConfirmationEmailMiddleware } from '../middleware/karma/send-karma-confirmation-email.middleware';
import { verifyMpWebhookSignatureMiddleware } from '../middleware/karma/verify-mp-webhook-signature.middleware';
import { createProcessMpWebhook } from '../middleware/karma/process-mp-webhook.middleware';
import { createAttachPurchaseUser } from '../middleware/karma/attach-purchase-user.middleware';
import { createVerifyMpPurchaseOwnership } from '../middleware/karma/verify-mp-purchase-ownership.middleware';
import { makeNotifyKarmaPurchase } from '../middleware/notifications/notify-karma-purchase.middleware';
import { respond } from '../middleware/respond.middleware';
import { logCtaEvent, logEvent } from '../lib/log-event';

// Unlike the webhook's unconditional logCtaEvent, GET /purchase/mp/status/:purchaseRef is
// polled far more frequently (up to 12x per purchase) — only log a cta_karma_purchase event
// when this exact call actually just self-healed the purchase to 'completed' (req.karmaPurchase
// is only set on that transition, see verify-mp-purchase-ownership.middleware.ts), or every
// poll would flood analytics with mostly-empty events.
function logCtaKarmaPurchaseIfCompleted(req: Request, _res: Response, next: NextFunction): void {
  if (req.karmaPurchase) {
    logEvent(req, 'cta_karma_purchase', { provider: 'mercadopago', amount: req.karmaPurchase.amount });
  }
  next();
}

export function createKarmaRouter(
  karma: KarmaController,
  karmaPurchase: KarmaPurchaseController,
  mercadopago: MercadoPagoController,
  purchaseRepo: IKarmaPurchaseRepository,
  userRepo: IUserRepository,
  notificationRepo: INotificationRepository,
): Router {
  const router = Router();
  const verifyOwnership     = createVerifyPurchaseOwnership(purchaseRepo);
  const notifyKarmaPurchase = makeNotifyKarmaPurchase(notificationRepo);
  const processMpWebhook  = createProcessMpWebhook(purchaseRepo);
  const attachPurchaseUser = createAttachPurchaseUser(userRepo);
  const verifyMpOwnership = createVerifyMpPurchaseOwnership(purchaseRepo);

  // GET /karma — authenticated user's karma score
  router.get('/',
    requireAuth,
    karma.get,
    respond(200),
  );

  // GET /karma/packages — list available karma packs (requires login so we can gate UI)
  router.get('/packages',
    requireAuth,
    karmaPurchase.getPackages,
    respond(200),
  );

  // POST /karma/purchase/create-order — create a PayPal order for a package
  router.post('/purchase/create-order',
    requireAuth,
    validateBody(createOrderSchema),
    validateKarmaPackage,
    karmaPurchase.createOrder,
    respond(201),
  );

  // POST /karma/purchase/capture-order — capture approved PayPal payment and credit karma
  router.post('/purchase/capture-order',
    requireAuth,
    validateBody(captureOrderSchema),
    verifyOwnership,
    karmaPurchase.captureOrder,
    logCtaEvent('cta_karma_purchase', req => ({ provider: req.karmaPurchase?.provider, amount: req.karmaPurchase?.amount })),
    sendKarmaConfirmationEmailMiddleware,
    notifyKarmaPurchase,
    respond(200),
  );

  // POST /karma/purchase/mp/create-preference — create a MercadoPago Checkout Pro preference
  router.post('/purchase/mp/create-preference',
    requireAuth,
    validateBody(createOrderSchema),
    validateKarmaPackage,
    mercadopago.createPreference,
    respond(201),
  );

  // POST /karma/purchase/mp/webhook — MercadoPago calls this directly (no JWT)
  router.post('/purchase/mp/webhook',
    verifyMpWebhookSignatureMiddleware,
    processMpWebhook,
    attachPurchaseUser,
    logCtaEvent('cta_karma_purchase', req => ({ provider: 'mercadopago', amount: req.karmaPurchase?.amount })),
    sendKarmaConfirmationEmailMiddleware,
    notifyKarmaPurchase,
    respond(200),
  );

  // GET /karma/purchase/mp/status/:purchaseRef — polled by the frontend after MP redirects back
  router.get('/purchase/mp/status/:purchaseRef',
    requireAuth,
    verifyMpOwnership,
    logCtaKarmaPurchaseIfCompleted,
    sendKarmaConfirmationEmailMiddleware,
    notifyKarmaPurchase,
    respond(200),
  );

  return router;
}
