import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubKarmaRepository, StubKarmaPurchaseRepository, StubNotificationRepository } from './helpers/stubs';
import { UserController }          from '../src/controllers/user.controller';
import { KarmaController }         from '../src/controllers/karma.controller';
import { KarmaPurchaseController } from '../src/controllers/karma-purchase.controller';
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

// Mock PayPal lib — the controller calls these; stub returns fake provider IDs
jest.mock('../src/lib/paypal', () => ({
  createPayPalOrder:  jest.fn().mockResolvedValue('pp-order-abc123'),
  capturePayPalOrder: jest.fn().mockResolvedValue({ captureId: 'pp-capture-xyz789' }),
}));

// Suppress confirmation email in tests
jest.mock('../src/middleware/karma/send-karma-confirmation-email.middleware', () => ({
  sendKarmaConfirmationEmailMiddleware: (_req: any, _res: any, next: any) => next(),
}));

function buildApp() {
  const purchaseRepo = new StubKarmaPurchaseRepository();
  const app = express();
  app.use(express.json());
  app.use('/auth',  createAuthRouter(new UserController(new StubUserRepository())));
  app.use('/karma', createKarmaRouter(
    new KarmaController(new StubKarmaRepository()),
    new KarmaPurchaseController(purchaseRepo),
    purchaseRepo,
    new StubNotificationRepository(),
  ));
  app.use(errorHandler);
  return app;
}

async function getToken(app: express.Express): Promise<string> {
  const res = await request(app).post('/auth/register').send({ name: 'Tester', email: 'test@karma.com', password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

// ── GET /karma/packages ────────────────────────────────────────────────────

describe('GET /karma/packages', () => {
  it('returns 401 without token', async () => {
    expect((await request(buildApp()).get('/karma/packages')).status).toBe(401);
  });

  it('returns the hardcoded package list', async () => {
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app).get('/karma/packages').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.packages)).toBe(true);
    expect(res.body.packages.length).toBeGreaterThan(0);
    expect(res.body.packages[0]).toMatchObject({
      id: expect.any(String),
      karma: expect.any(Number),
      price: expect.any(String),
      currency: expect.any(String),
    });
  });
});

// ── POST /karma/purchase/create-order ─────────────────────────────────────

describe('POST /karma/purchase/create-order', () => {
  it('returns 401 without token', async () => {
    expect((await request(buildApp()).post('/karma/purchase/create-order').send({ packageId: 'karma_10' })).status).toBe(401);
  });

  it('returns 400 for unknown packageId', async () => {
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post('/karma/purchase/create-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: 'karma_999' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when packageId is missing', async () => {
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post('/karma/purchase/create-order')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 201 with orderID for a valid package', async () => {
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post('/karma/purchase/create-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: 'karma_10' });
    expect(res.status).toBe(201);
    expect(typeof res.body.orderID).toBe('string');
    expect(res.body.orderID).toBe('pp-order-abc123');
  });
});

// ── POST /karma/purchase/capture-order ────────────────────────────────────

describe('POST /karma/purchase/capture-order', () => {
  it('returns 401 without token', async () => {
    expect((await request(buildApp()).post('/karma/purchase/capture-order').send({ orderID: 'x' })).status).toBe(401);
  });

  it('returns 400 when orderID is missing', async () => {
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post('/karma/purchase/capture-order')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent orderID', async () => {
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post('/karma/purchase/capture-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderID: 'does-not-exist' });
    expect(res.status).toBe(404);
  });

  it('returns 200 with karma data after valid capture', async () => {
    const app = buildApp();
    const token = await getToken(app);

    // First create an order
    const createRes = await request(app)
      .post('/karma/purchase/create-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: 'karma_10' });
    expect(createRes.status).toBe(201);
    const { orderID } = createRes.body;

    // Then capture it
    const captureRes = await request(app)
      .post('/karma/purchase/capture-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderID });
    expect(captureRes.status).toBe(200);
    expect(typeof captureRes.body.karma).toBe('number');
    expect(captureRes.body.karmaAdded).toBe(10);
  });

  it('returns 409 when trying to capture an already-processed order', async () => {
    const app = buildApp();
    const token = await getToken(app);

    const createRes = await request(app)
      .post('/karma/purchase/create-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: 'karma_10' });
    const { orderID } = createRes.body;

    // First capture — succeeds
    await request(app)
      .post('/karma/purchase/capture-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderID });

    // Second capture — should be 409
    const res = await request(app)
      .post('/karma/purchase/capture-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderID });
    expect(res.status).toBe(409);
  });
});
