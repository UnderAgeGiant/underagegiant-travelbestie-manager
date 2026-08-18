jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({
  decryptPayloadMiddleware: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../src/middleware/auth/verify-otp.middleware', () => ({
  verifyOtpMiddleware: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../src/middleware/rate-limit.middleware', () => ({
  rateLimitMiddleware: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../src/lib/redis', () => ({
  redis: { set: jest.fn().mockResolvedValue('OK'), get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1), incr: jest.fn().mockResolvedValue(1), expire: jest.fn().mockResolvedValue(1) },
}));
jest.mock('../src/lib/refresh-tokens', () => ({
  REFRESH_TTL: 86400, issueRefreshToken: jest.fn().mockResolvedValue('mock-refresh-token'),
  validateAndRotate: jest.fn(), revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/lib/email', () => ({
  sendOtpEmail: jest.fn().mockResolvedValue(undefined), sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
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

describe('auth route validation (zod)', () => {
  it('rejects register with a malformed email', async () => {
    const res = await request(buildApp()).post('/auth/register')
      .send({ name: 'Ana', email: 'bogus', password: 'secret123', otp: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('email');
  });

  it('rejects register with a too-short password', async () => {
    const res = await request(buildApp()).post('/auth/register')
      .send({ name: 'Ana', email: 'ana@test.com', password: '123', otp: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('password');
  });

  it('accepts a well-formed register payload', async () => {
    const res = await request(buildApp()).post('/auth/register')
      .send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
  });

  it('rejects reset-password with a 5-digit otp', async () => {
    const res = await request(buildApp()).post('/auth/reset-password')
      .send({ email: 'ana@test.com', otp: '12345', newPassword: 'secret123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('otp');
  });
});
