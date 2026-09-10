import request from 'supertest';
import express from 'express';
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
}));

function buildApp() {
  const purchaseRepo = new StubKarmaPurchaseRepository();
  const userRepo = new StubUserRepository();
  const app = express();
  app.use(express.json());
  app.use('/auth',  createAuthRouter(new UserController(userRepo), new StubHighlightRepository()));
  app.use('/karma', createKarmaRouter(
    new KarmaController(new StubKarmaRepository()),
    new KarmaPurchaseController(purchaseRepo),
    new MercadoPagoController(purchaseRepo),
    purchaseRepo,
    userRepo,
    new StubNotificationRepository(),
  ));
  app.use(errorHandler);
  return { app, purchaseRepo, userRepo };
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
