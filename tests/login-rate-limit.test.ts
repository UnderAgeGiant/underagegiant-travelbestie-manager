jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({
  decryptPayloadMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// Real rate-limit middleware (NOT mocked) driven by a mocked Redis counter.
const mockRedis = {
  set:    jest.fn().mockResolvedValue('OK'),
  get:    jest.fn().mockResolvedValue(null),
  del:    jest.fn().mockResolvedValue(1),
  incr:   jest.fn(),
  expire: jest.fn().mockResolvedValue(1),
};
jest.mock('../src/lib/redis', () => ({ redis: mockRedis }));

jest.mock('../src/lib/refresh-tokens', () => ({
  REFRESH_TTL:            86400,
  issueRefreshToken:      jest.fn().mockResolvedValue('mock-refresh-token'),
  validateAndRotate:      jest.fn(),
  revokeRefreshToken:     jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/lib/email', () => ({
  sendOtpEmail:               jest.fn().mockResolvedValue(undefined),
  sendWelcomeEmail:           jest.fn().mockResolvedValue(undefined),
  sendKarmaConfirmationEmail: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubHighlightRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { errorHandler } from '../src/middleware/error.middleware';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(new StubUserRepository()), new StubHighlightRepository()));
  app.use(errorHandler);
  return app;
}

describe('POST /auth/login rate limiting (B-1)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 429 once the login attempt counter exceeds the limit', async () => {
    mockRedis.incr.mockResolvedValue(11); // exceeds the 10/15-min limit
    const res = await request(buildApp()).post('/auth/login')
      .send({ email: 'victim@test.com', password: 'guess' });
    expect(res.status).toBe(429);
    expect(res.body.error).toBeDefined();
  });

  it('keys the limiter by IP + email (composite key includes the email)', async () => {
    mockRedis.incr.mockResolvedValue(1);
    await request(buildApp()).post('/auth/login')
      .send({ email: 'Victim@Test.com', password: 'guess' });
    // First incr call is the login limiter; key must contain the lower-cased email.
    const keyArg = mockRedis.incr.mock.calls[0][0] as string;
    expect(keyArg).toContain('rl:login');
    expect(keyArg).toContain('victim@test.com');
  });
});
