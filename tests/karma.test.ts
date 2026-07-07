import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubKarmaRepository, StubKarmaPurchaseRepository, StubNotificationRepository } from './helpers/stubs';
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
  const res = await request(app).post('/auth/register').send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

describe('GET /karma', () => {
  it('returns 401 without token', async () => {
    expect((await request(buildApp()).get('/karma')).status).toBe(401);
  });

  it('returns karma score for authenticated user', async () => {
    const app = buildApp();
    const res = await request(app).get('/karma').set('Authorization', `Bearer ${await getToken(app)}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.karma).toBe('number');
  });
});
