import request from 'supertest';
import express from 'express';
import { createMpPreference, fetchMpPayment, verifyMpWebhookSignature, searchMpPayments } from '../src/lib/mercadopago';
import { StubUserRepository, StubKarmaRepository, StubKarmaPurchaseRepository, StubNotificationRepository, StubHighlightRepository } from './helpers/stubs';
import { UserController }          from '../src/controllers/user.controller';
import { KarmaController }         from '../src/controllers/karma.controller';
import { KarmaPurchaseController } from '../src/controllers/karma-purchase.controller';
import { MercadoPagoController }   from '../src/controllers/mercadopago.controller';
import { createAuthRouter }  from '../src/routes/auth.routes';
import { createKarmaRouter } from '../src/routes/karma.routes';
import { errorHandler }      from '../src/middleware/error.middleware';

jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({
  decryptPayloadMiddleware: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../src/middleware/auth/verify-otp.middleware', () => ({
  verifyOtpMiddleware: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../src/middleware/rate-limit.middleware', () => ({
  rateLimitMiddleware: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../src/lib/refresh-tokens', () => ({
  REFRESH_TTL:            86400,
  issueRefreshToken:      jest.fn().mockResolvedValue('mock-refresh-token'),
  validateAndRotate:      jest.fn(),
  revokeRefreshToken:     jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/middleware/karma/send-karma-confirmation-email.middleware', () => ({
  sendKarmaConfirmationEmailMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// Mock the MercadoPago lib — the controller/middleware call these; stub returns fake provider data.
jest.mock('../src/lib/mercadopago', () => ({
  createMpPreference: jest.fn().mockResolvedValue({ preferenceId: 'pref-abc', initPoint: 'https://mp.example.com/checkout/pref-abc' }),
  fetchMpPayment: jest.fn(),
  verifyMpWebhookSignature: jest.fn(),
  searchMpPayments: jest.fn(),
}));

function buildApp() {
  const purchaseRepo = new StubKarmaPurchaseRepository();
  const userRepo = new StubUserRepository();
  const notificationRepo = new StubNotificationRepository();
  const app = express();
  app.use(express.json());
  app.use('/auth',  createAuthRouter(new UserController(userRepo), new StubHighlightRepository()));
  app.use('/karma', createKarmaRouter(
    new KarmaController(new StubKarmaRepository()),
    new KarmaPurchaseController(purchaseRepo),
    new MercadoPagoController(purchaseRepo),
    purchaseRepo,
    userRepo,
    notificationRepo,
  ));
  app.use(errorHandler);
  return { app, purchaseRepo, userRepo, notificationRepo };
}

async function getToken(app: express.Express): Promise<string> {
  const res = await request(app).post('/auth/register').send({ name: 'Tester', email: 'test@mp.com', password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

describe('POST /karma/purchase/mp/create-preference', () => {
  it('returns 401 without token', async () => {
    const { app } = buildApp();
    expect((await request(app).post('/karma/purchase/mp/create-preference').send({ packageId: 'karma_10' })).status).toBe(401);
  });

  it('returns 400 for unknown packageId', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post('/karma/purchase/mp/create-preference')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: 'karma_999' });
    expect(res.status).toBe(400);
  });

  it('returns 201 with preferenceId and initPoint for a valid package', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post('/karma/purchase/mp/create-preference')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: 'karma_10' });
    expect(res.status).toBe(201);
    expect(res.body.preferenceId).toBe('pref-abc');
    expect(res.body.initPoint).toBe('https://mp.example.com/checkout/pref-abc');
  });

  it('stores a pending purchase intent with provider=mercadopago and a generated purchaseRef', async () => {
    const { app, purchaseRepo } = buildApp();
    const token = await getToken(app);
    await request(app)
      .post('/karma/purchase/mp/create-preference')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: 'karma_10' });

    // The stub keyed the purchase by whatever providerOrderId createPurchaseIntent was called with —
    // find it by scanning, since we don't know the generated UUID ahead of time.
    const stored = Array.from((purchaseRepo as any).store.values())[0] as any;
    expect(stored.provider).toBe('mercadopago');
    expect(stored.status).toBe('pending');
    expect(stored.providerOrderId).toMatch(/^mp_/);
    expect(stored.currency).toBe('CLP');
    expect(stored.amount).toBe('900');
    expect(stored.karmaAmount).toBe(10);
  });
});

describe('POST /karma/purchase/mp/webhook', () => {
  beforeEach(() => {
    (verifyMpWebhookSignature as jest.Mock).mockReturnValue(true);
  });

  it('returns 401 when the signature is invalid', async () => {
    (verifyMpWebhookSignature as jest.Mock).mockReturnValue(false);
    const { app } = buildApp();
    const res = await request(app)
      .post('/karma/purchase/mp/webhook')
      .set('x-signature', 'ts=1,v1=bad')
      .set('x-request-id', 'req-1')
      .send({ data: { id: 'pay-1' } });
    expect(res.status).toBe(401);
  });

  it('acks 200 for a non-payment topic (?topic=merchant_order) without ever checking the signature', async () => {
    (verifyMpWebhookSignature as jest.Mock).mockReturnValue(false); // would 401 if the filter didn't short-circuit first
    const { app } = buildApp();
    const res = await request(app)
      .post('/karma/purchase/mp/webhook?id=44344824471&topic=merchant_order')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(verifyMpWebhookSignature).not.toHaveBeenCalled();
    expect(fetchMpPayment).not.toHaveBeenCalled();
  });

  it('acks 200 for a non-payment type in the JSON body without ever checking the signature', async () => {
    (verifyMpWebhookSignature as jest.Mock).mockReturnValue(false);
    const { app } = buildApp();
    const res = await request(app)
      .post('/karma/purchase/mp/webhook')
      .send({ type: 'subscription_authorized_payment', data: { id: 'sub-1' } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(verifyMpWebhookSignature).not.toHaveBeenCalled();
  });

  it('still requires a valid signature for an explicit ?topic=payment notification', async () => {
    (verifyMpWebhookSignature as jest.Mock).mockReturnValue(false);
    const { app } = buildApp();
    const res = await request(app)
      .post('/karma/purchase/mp/webhook?topic=payment&id=pay-1')
      .send({});
    expect(res.status).toBe(401);
  });

  it('credits karma and returns 200 for an approved payment matching a pending purchase', async () => {
    const { app, purchaseRepo } = buildApp();
    const token = await getToken(app);

    const createRes = await request(app)
      .post('/karma/purchase/mp/create-preference')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: 'karma_10' });
    const stored = Array.from((purchaseRepo as any).store.values())[0] as any;
    const purchaseRef = stored.providerOrderId;
    expect(createRes.status).toBe(201);

    (fetchMpPayment as jest.Mock).mockResolvedValue({ status: 'approved', externalReference: purchaseRef, transactionAmount: 900 });

    const res = await request(app)
      .post('/karma/purchase/mp/webhook')
      .set('x-signature', 'ts=1,v1=ok')
      .set('x-request-id', 'req-2')
      .send({ data: { id: 'pay-2' } });

    expect(res.status).toBe(200);
    const updated = await purchaseRepo.findByOrderId(purchaseRef);
    expect(updated!.status).toBe('completed');
    expect(updated!.providerCaptureId).toBe('pay-2');
  });

  it('marks the purchase failed and does not credit karma when the paid amount does not match the stored purchase amount', async () => {
    const { app, purchaseRepo } = buildApp();
    const token = await getToken(app);

    await request(app)
      .post('/karma/purchase/mp/create-preference')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: 'karma_10' }); // stored amount is '900' (CLP)
    const stored = Array.from((purchaseRepo as any).store.values())[0] as any;
    const purchaseRef = stored.providerOrderId;

    // Payer's actual charged amount (1) doesn't match the requested package price (900) —
    // a tampering or MercadoPago-integration anomaly. Must never credit karma for this.
    (fetchMpPayment as jest.Mock).mockResolvedValue({ status: 'approved', externalReference: purchaseRef, transactionAmount: 1 });

    const res = await request(app)
      .post('/karma/purchase/mp/webhook')
      .set('x-signature', 'ts=1,v1=ok')
      .set('x-request-id', 'req-amount-mismatch')
      .send({ data: { id: 'pay-amount-mismatch' } });

    expect(res.status).toBe(200); // still acked — an anticipated condition, not a retryable failure
    const updated = await purchaseRepo.findByOrderId(purchaseRef);
    expect(updated!.status).toBe('failed');
    expect(updated!.failureReason).toBe('amount_mismatch');
    expect(updated!.providerCaptureId).toBeNull(); // never captured/completed
  });

  it('marks the purchase failed with reason "cancelled" for a cancelled payment', async () => {
    const { app, purchaseRepo } = buildApp();
    const token = await getToken(app);

    await request(app)
      .post('/karma/purchase/mp/create-preference')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: 'karma_10' });
    const stored = Array.from((purchaseRepo as any).store.values())[0] as any;
    const purchaseRef = stored.providerOrderId;

    (fetchMpPayment as jest.Mock).mockResolvedValue({ status: 'cancelled', externalReference: purchaseRef, transactionAmount: 900 });

    const res = await request(app)
      .post('/karma/purchase/mp/webhook')
      .set('x-signature', 'ts=1,v1=ok')
      .set('x-request-id', 'req-cancelled')
      .send({ data: { id: 'pay-cancelled' } });

    expect(res.status).toBe(200);
    const updated = await purchaseRepo.findByOrderId(purchaseRef);
    expect(updated!.status).toBe('failed');
    expect(updated!.failureReason).toBe('cancelled');
  });

  it('marks the purchase failed for a rejected payment', async () => {
    const { app, purchaseRepo } = buildApp();
    const token = await getToken(app);

    await request(app)
      .post('/karma/purchase/mp/create-preference')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: 'karma_10' });
    const stored = Array.from((purchaseRepo as any).store.values())[0] as any;
    const purchaseRef = stored.providerOrderId;

    (fetchMpPayment as jest.Mock).mockResolvedValue({ status: 'rejected', externalReference: purchaseRef, transactionAmount: 900 });

    const res = await request(app)
      .post('/karma/purchase/mp/webhook')
      .set('x-signature', 'ts=1,v1=ok')
      .set('x-request-id', 'req-3')
      .send({ data: { id: 'pay-3' } });

    expect(res.status).toBe(200);
    const updated = await purchaseRepo.findByOrderId(purchaseRef);
    expect(updated!.status).toBe('failed');
    expect(updated!.failureReason).toBe('rejected');
  });

  it('returns 200 with no changes for an unknown external_reference (idempotent ack, no retry storm)', async () => {
    const { app } = buildApp();
    (fetchMpPayment as jest.Mock).mockResolvedValue({ status: 'approved', externalReference: 'mp_does-not-exist', transactionAmount: 900 });

    const res = await request(app)
      .post('/karma/purchase/mp/webhook')
      .set('x-signature', 'ts=1,v1=ok')
      .set('x-request-id', 'req-4')
      .send({ data: { id: 'pay-4' } });

    expect(res.status).toBe(200);
  });

  it('returns 200 with no re-processing for an already-completed purchase (duplicate MP notification)', async () => {
    const { app, purchaseRepo } = buildApp();
    const token = await getToken(app);

    await request(app)
      .post('/karma/purchase/mp/create-preference')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: 'karma_10' });
    const stored = Array.from((purchaseRepo as any).store.values())[0] as any;
    const purchaseRef = stored.providerOrderId;

    (fetchMpPayment as jest.Mock).mockResolvedValue({ status: 'approved', externalReference: purchaseRef, transactionAmount: 900 });
    await request(app).post('/karma/purchase/mp/webhook').set('x-signature', 'ts=1,v1=ok').set('x-request-id', 'req-5').send({ data: { id: 'pay-5' } });

    const before = await purchaseRepo.findByOrderId(purchaseRef);

    // MercadoPago retries the same notification
    const res = await request(app).post('/karma/purchase/mp/webhook').set('x-signature', 'ts=1,v1=ok').set('x-request-id', 'req-5').send({ data: { id: 'pay-5' } });
    expect(res.status).toBe(200);

    const after = await purchaseRepo.findByOrderId(purchaseRef);
    expect(after!.completedAt).toBe(before!.completedAt); // unchanged — not reprocessed
  });
});

describe('GET /karma/purchase/mp/status/:purchaseRef', () => {
  beforeEach(() => {
    (searchMpPayments as jest.Mock).mockResolvedValue([]);
  });

  it('returns 401 without token', async () => {
    const { app } = buildApp();
    expect((await request(app).get('/karma/purchase/mp/status/mp_x')).status).toBe(401);
  });

  it('returns 404 for a purchaseRef that does not exist', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const res = await request(app).get('/karma/purchase/mp/status/mp_does-not-exist').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns pending status right after create-preference, before any webhook', async () => {
    const { app, purchaseRepo } = buildApp();
    const token = await getToken(app);
    await request(app).post('/karma/purchase/mp/create-preference').set('Authorization', `Bearer ${token}`).send({ packageId: 'karma_10' });
    const stored = Array.from((purchaseRepo as any).store.values())[0] as any;

    const res = await request(app).get(`/karma/purchase/mp/status/${stored.providerOrderId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(res.body.karmaAdded).toBeUndefined();
  });

  it('returns completed status with karmaAdded once the webhook has processed it', async () => {
    const { app, purchaseRepo } = buildApp();
    const token = await getToken(app);
    await request(app).post('/karma/purchase/mp/create-preference').set('Authorization', `Bearer ${token}`).send({ packageId: 'karma_10' });
    const stored = Array.from((purchaseRepo as any).store.values())[0] as any;
    const purchaseRef = stored.providerOrderId;

    (verifyMpWebhookSignature as jest.Mock).mockReturnValue(true);
    (fetchMpPayment as jest.Mock).mockResolvedValue({ status: 'approved', externalReference: purchaseRef, transactionAmount: 900 });
    await request(app).post('/karma/purchase/mp/webhook').set('x-signature', 'ts=1,v1=ok').set('x-request-id', 'req-status-1').send({ data: { id: 'pay-status-1' } });

    const res = await request(app).get(`/karma/purchase/mp/status/${purchaseRef}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.karmaAdded).toBe(10);
  });

  it('returns 404 when a different user polls someone else\'s purchase', async () => {
    const { app, purchaseRepo } = buildApp();
    const ownerToken = await getToken(app);
    await request(app).post('/karma/purchase/mp/create-preference').set('Authorization', `Bearer ${ownerToken}`).send({ packageId: 'karma_10' });
    const stored = Array.from((purchaseRepo as any).store.values())[0] as any;

    const otherRes = await request(app).post('/auth/register').send({ name: 'Other', email: 'other@mp.com', password: 'secret123', otp: '123456' });
    const otherToken = otherRes.body.token as string;

    const res = await request(app).get(`/karma/purchase/mp/status/${stored.providerOrderId}`).set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });

  it('reconciles to failed/rejected when the search API finds a rejected payment the webhook never reported', async () => {
    const { app, purchaseRepo } = buildApp();
    const token = await getToken(app);
    await request(app).post('/karma/purchase/mp/create-preference').set('Authorization', `Bearer ${token}`).send({ packageId: 'karma_10' });
    const stored = Array.from((purchaseRepo as any).store.values())[0] as any;
    const purchaseRef = stored.providerOrderId;

    (searchMpPayments as jest.Mock).mockResolvedValue([{ id: 'pay-x', status: 'rejected' }]);

    const res = await request(app).get(`/karma/purchase/mp/status/${purchaseRef}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('failed');
    const updated = await purchaseRepo.findByOrderId(purchaseRef);
    expect(updated!.failureReason).toBe('rejected');
  });

  it('reconciles to failed/abandoned when no payment record exists and the purchase has been pending long enough', async () => {
    const { app, purchaseRepo } = buildApp();
    const token = await getToken(app);
    await request(app).post('/karma/purchase/mp/create-preference').set('Authorization', `Bearer ${token}`).send({ packageId: 'karma_10' });
    const stored = Array.from((purchaseRepo as any).store.values())[0] as any;
    const purchaseRef = stored.providerOrderId;
    // Simulate a purchase old enough to safely conclude it was abandoned before any payment attempt.
    stored.createdAt = new Date(Date.now() - 60_000).toISOString();
    (purchaseRepo as any).store.set(purchaseRef, stored);

    (searchMpPayments as jest.Mock).mockResolvedValue([]);

    const res = await request(app).get(`/karma/purchase/mp/status/${purchaseRef}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('failed');
    const updated = await purchaseRepo.findByOrderId(purchaseRef);
    expect(updated!.failureReason).toBe('abandoned');
  });

  it('leaves a freshly-created purchase pending even when search finds nothing yet (age gate)', async () => {
    const { app, purchaseRepo } = buildApp();
    const token = await getToken(app);
    await request(app).post('/karma/purchase/mp/create-preference').set('Authorization', `Bearer ${token}`).send({ packageId: 'karma_10' });
    const stored = Array.from((purchaseRepo as any).store.values())[0] as any;
    const purchaseRef = stored.providerOrderId;

    (searchMpPayments as jest.Mock).mockResolvedValue([]);

    const res = await request(app).get(`/karma/purchase/mp/status/${purchaseRef}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(searchMpPayments).toHaveBeenCalledWith(purchaseRef);
    const updated = await purchaseRepo.findByOrderId(purchaseRef);
    expect(updated!.status).toBe('pending');
  });

  it('leaves the purchase pending when search finds an in-process payment, regardless of age', async () => {
    const { app, purchaseRepo } = buildApp();
    const token = await getToken(app);
    await request(app).post('/karma/purchase/mp/create-preference').set('Authorization', `Bearer ${token}`).send({ packageId: 'karma_10' });
    const stored = Array.from((purchaseRepo as any).store.values())[0] as any;
    const purchaseRef = stored.providerOrderId;
    stored.createdAt = new Date(Date.now() - 60_000).toISOString();
    (purchaseRepo as any).store.set(purchaseRef, stored);

    (searchMpPayments as jest.Mock).mockResolvedValue([{ id: 'pay-x', status: 'in_process' }]);

    const res = await request(app).get(`/karma/purchase/mp/status/${purchaseRef}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
  });

  it('fails open (stays pending, 200) when the MercadoPago search API errors', async () => {
    const { app, purchaseRepo } = buildApp();
    const token = await getToken(app);
    await request(app).post('/karma/purchase/mp/create-preference').set('Authorization', `Bearer ${token}`).send({ packageId: 'karma_10' });
    const stored = Array.from((purchaseRepo as any).store.values())[0] as any;
    const purchaseRef = stored.providerOrderId;
    stored.createdAt = new Date(Date.now() - 60_000).toISOString();
    (purchaseRepo as any).store.set(purchaseRef, stored);

    (searchMpPayments as jest.Mock).mockRejectedValue(new Error('network blip'));

    const res = await request(app).get(`/karma/purchase/mp/status/${purchaseRef}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    const updated = await purchaseRepo.findByOrderId(purchaseRef);
    expect(updated!.status).toBe('pending');
  });

  it('completes the purchase and credits karma when search finds an approved payment the webhook never reported', async () => {
    const { app, purchaseRepo, notificationRepo } = buildApp();
    const token = await getToken(app);
    await request(app).post('/karma/purchase/mp/create-preference').set('Authorization', `Bearer ${token}`).send({ packageId: 'karma_10' });
    const stored = Array.from((purchaseRepo as any).store.values())[0] as any;
    const purchaseRef = stored.providerOrderId;

    (searchMpPayments as jest.Mock).mockResolvedValue([{ id: 'pay-approved', status: 'approved' }]);
    (fetchMpPayment as jest.Mock).mockResolvedValue({ status: 'approved', externalReference: purchaseRef, transactionAmount: 900 });

    const res = await request(app).get(`/karma/purchase/mp/status/${purchaseRef}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.karmaAdded).toBe(10);

    const updated = await purchaseRepo.findByOrderId(purchaseRef);
    expect(updated!.status).toBe('completed');
    expect(updated!.providerCaptureId).toBe('pay-approved');

    // Same side effects the webhook fires on completion — confirmation email/notification/CTA —
    // must also fire here, or a purchase completed only via self-heal never notifies the buyer.
    expect(notificationRepo.items).toHaveLength(1);
  });

  it('does not re-fire completion side effects on a second poll of an already-completed purchase', async () => {
    const { app, purchaseRepo, notificationRepo } = buildApp();
    const token = await getToken(app);
    await request(app).post('/karma/purchase/mp/create-preference').set('Authorization', `Bearer ${token}`).send({ packageId: 'karma_10' });
    const stored = Array.from((purchaseRepo as any).store.values())[0] as any;
    const purchaseRef = stored.providerOrderId;

    (searchMpPayments as jest.Mock).mockResolvedValue([{ id: 'pay-approved', status: 'approved' }]);
    (fetchMpPayment as jest.Mock).mockResolvedValue({ status: 'approved', externalReference: purchaseRef, transactionAmount: 900 });

    await request(app).get(`/karma/purchase/mp/status/${purchaseRef}`).set('Authorization', `Bearer ${token}`);
    expect(notificationRepo.items).toHaveLength(1);

    const res2 = await request(app).get(`/karma/purchase/mp/status/${purchaseRef}`).set('Authorization', `Bearer ${token}`);
    expect(res2.status).toBe(200);
    expect(res2.body.status).toBe('completed');
    expect(notificationRepo.items).toHaveLength(1); // unchanged — not re-notified
  });

  it('fails with amount_mismatch (no karma credited) when the approved payment found via search has the wrong amount', async () => {
    const { app, purchaseRepo, notificationRepo } = buildApp();
    const token = await getToken(app);
    await request(app).post('/karma/purchase/mp/create-preference').set('Authorization', `Bearer ${token}`).send({ packageId: 'karma_10' }); // stored amount '900'
    const stored = Array.from((purchaseRepo as any).store.values())[0] as any;
    const purchaseRef = stored.providerOrderId;

    (searchMpPayments as jest.Mock).mockResolvedValue([{ id: 'pay-approved', status: 'approved' }]);
    (fetchMpPayment as jest.Mock).mockResolvedValue({ status: 'approved', externalReference: purchaseRef, transactionAmount: 1 });

    const res = await request(app).get(`/karma/purchase/mp/status/${purchaseRef}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('failed');
    expect(res.body.karmaAdded).toBeUndefined();

    const updated = await purchaseRepo.findByOrderId(purchaseRef);
    expect(updated!.status).toBe('failed');
    expect(updated!.failureReason).toBe('amount_mismatch');
    expect(notificationRepo.items).toHaveLength(0);
  });
});
