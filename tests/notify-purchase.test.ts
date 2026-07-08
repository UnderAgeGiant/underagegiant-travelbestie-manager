import request from 'supertest';
import express from 'express';
import {
  StubUserRepository, StubKarmaRepository, StubKarmaPurchaseRepository, StubNotificationRepository,
} from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { KarmaPurchaseController } from '../src/controllers/karma-purchase.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createKarmaRouter } from '../src/routes/karma.routes';
import { errorHandler } from '../src/middleware/error.middleware';

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

jest.mock('../src/lib/paypal', () => ({
  createPayPalOrder:  jest.fn().mockResolvedValue('pp-order-abc123'),
  capturePayPalOrder: jest.fn().mockResolvedValue({ captureId: 'pp-capture-xyz789' }),
}));

jest.mock('../src/middleware/karma/send-karma-confirmation-email.middleware', () => ({
  sendKarmaConfirmationEmailMiddleware: (_req: any, _res: any, next: any) => next(),
}));

function buildApp(notificationRepo = new StubNotificationRepository()) {
  const purchaseRepo = new StubKarmaPurchaseRepository();
  const app = express();
  app.use(express.json());
  app.use('/auth',  createAuthRouter(new UserController(new StubUserRepository())));
  app.use('/karma', createKarmaRouter(
    new KarmaController(new StubKarmaRepository()),
    new KarmaPurchaseController(purchaseRepo),
    purchaseRepo,
    notificationRepo,
  ));
  app.use(errorHandler);
  return { app, notificationRepo };
}

async function getToken(app: express.Express): Promise<string> {
  const res = await request(app)
    .post('/auth/register')
    .send({ name: 'Tester', email: 'test@karma.com', password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

function decodeUserId(token: string): string {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { userId: string };
  return payload.userId;
}

async function buyKarma(app: express.Express, token: string) {
  await request(app)
    .post('/karma/purchase/create-order')
    .set('Authorization', `Bearer ${token}`)
    .send({ packageId: 'karma_10' });
  return request(app)
    .post('/karma/purchase/capture-order')
    .set('Authorization', `Bearer ${token}`)
    .send({ orderID: 'pp-order-abc123' });
}

describe('notification on karma purchase', () => {
  it('1 — capture → buyer gets a purchase notification', async () => {
    const { app, notificationRepo } = buildApp();
    const token = await getToken(app);

    const res = await buyKarma(app, token);

    expect(res.status).toBe(200);
    const rows = await notificationRepo.listByUser(decodeUserId(token));
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('purchase');
    expect(rows[0].url).toBe('/');
    expect(rows[0].body).toContain('10');
  });

  it('2 — repository failure → capture still 200', async () => {
    class ThrowingRepo extends StubNotificationRepository {
      override async add(): Promise<void> { throw new Error('db down'); }
    }
    const { app } = buildApp(new ThrowingRepo());
    const token = await getToken(app);

    const res = await buyKarma(app, token);

    expect(res.status).toBe(200);
  });
});
