import { Router } from 'express';
import { KarmaController } from '../controllers/karma.controller';
import { KarmaPurchaseController } from '../controllers/karma-purchase.controller';
import { IKarmaPurchaseRepository } from '../repositories/interfaces/karma-purchase.repository';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { validateBody } from '../middleware/validate-body.middleware';
import { createOrderSchema, captureOrderSchema } from '../schemas/karma.schemas';
import { validateKarmaPackage } from '../middleware/karma/validate-karma-package.middleware';
import { createVerifyPurchaseOwnership } from '../middleware/karma/verify-purchase-ownership.middleware';
import { sendKarmaConfirmationEmailMiddleware } from '../middleware/karma/send-karma-confirmation-email.middleware';
import { respond } from '../middleware/respond.middleware';
import { logCtaEvent } from '../lib/log-event';

export function createKarmaRouter(
  karma: KarmaController,
  karmaPurchase: KarmaPurchaseController,
  purchaseRepo: IKarmaPurchaseRepository,
): Router {
  const router = Router();
  const verifyOwnership = createVerifyPurchaseOwnership(purchaseRepo);

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

  // POST /karma/purchase/create-order — create a provider order for a package
  router.post('/purchase/create-order',
    requireAuth,
    validateBody(createOrderSchema),
    validateKarmaPackage,
    karmaPurchase.createOrder,
    respond(201),
  );

  // POST /karma/purchase/capture-order — capture approved payment and credit karma
  router.post('/purchase/capture-order',
    requireAuth,
    validateBody(captureOrderSchema),
    verifyOwnership,
    karmaPurchase.captureOrder,
    logCtaEvent('cta_karma_purchase', req => ({ provider: req.karmaPurchase?.provider, amount: req.karmaPurchase?.amount })),
    sendKarmaConfirmationEmailMiddleware,
    respond(200),
  );

  return router;
}
