import request from 'supertest';
import express from 'express';
import { StubUserRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { errorHandler } from '../src/middleware/error.middleware';
import { validateAndRotate } from '../src/lib/refresh-tokens';

jest.mock('../src/lib/refresh-tokens', () => ({
  issueRefreshToken:      jest.fn().mockResolvedValue('mock-refresh-token'),
  validateAndRotate:      jest.fn(),
  revokeRefreshToken:     jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({
  decryptPayloadMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/middleware/auth/verify-otp.middleware', () => ({
  verifyOtpMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/middleware/rate-limit.middleware', () => ({
  rateLimitMiddleware: () => (_req: any, _res: any, next: any) => next(),
}));

const mockValidateAndRotate = validateAndRotate as jest.MockedFunction<typeof validateAndRotate>;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(new StubUserRepository())));
  app.use(errorHandler);
  return app;
}

describe('POST /auth/register', () => {
  it('registers a user and returns token + public user', async () => {
    const res = await request(buildApp()).post('/auth/register')
      .send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBe('mock-refresh-token');
    expect(res.body.user.name).toBe('Ana');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('returns 400 when email already taken', async () => {
    const app = buildApp();
    await request(app).post('/auth/register').send({ name: 'A', email: 'a@test.com', password: 'secret123', otp: '123456' });
    const res = await request(app).post('/auth/register').send({ name: 'B', email: 'a@test.com', password: 'secret456', otp: '123456' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when password too short', async () => {
    expect((await request(buildApp()).post('/auth/register').send({ name: 'X', email: 'x@x.com', password: '12', otp: '123456' })).status).toBe(400);
  });
});

describe('POST /auth/login', () => {
  it('returns token for valid credentials', async () => {
    const app = buildApp();
    await request(app).post('/auth/register').send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
    const res = await request(app).post('/auth/login').send({ email: 'ana@test.com', password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBe('mock-refresh-token');
  });

  it('returns 401 with incorrect-password message for wrong password', async () => {
    const app = buildApp();
    await request(app).post('/auth/register').send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
    const res = await request(app).post('/auth/login').send({ email: 'ana@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('WRONG_PASSWORD');
    expect(res.body.error).toBe('Incorrect password');
  });

  it('returns 401 with not-found message for unknown email', async () => {
    const res = await request(buildApp()).post('/auth/login').send({ email: 'nobody@test.com', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('USER_NOT_FOUND');
    expect(res.body.error).toBe('No account found with that email');
  });
});

describe('POST /auth/refresh', () => {
  it('returns 400 when refreshToken body field is missing', async () => {
    const res = await request(buildApp()).post('/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 when refresh token is invalid', async () => {
    mockValidateAndRotate.mockResolvedValueOnce(null);
    const res = await request(buildApp()).post('/auth/refresh')
      .send({ refreshToken: 'invalid-token-here' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_REFRESH_TOKEN');
  });

  it('returns 200 with new token and refreshToken for a valid token', async () => {
    const app = buildApp();
    // Register to get a real userId in the stub
    const regRes = await request(app).post('/auth/register')
      .send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
    const b64 = regRes.body.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const userId = JSON.parse(Buffer.from(b64, 'base64').toString()).userId;

    mockValidateAndRotate.mockResolvedValueOnce({ userId, newRaw: 'rotated-raw-token' });

    const res = await request(app).post('/auth/refresh')
      .send({ refreshToken: 'valid-token-here-xx' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.name).toBe('Ana');
  });
});

describe('POST /auth/logout', () => {
  it('returns 401 without a Bearer token', async () => {
    const res = await request(buildApp()).post('/auth/logout')
      .send({ refreshToken: 'any-token-here-xx' });
    expect(res.status).toBe(401);
  });

  it('returns 204 for a logged-in user', async () => {
    const app = buildApp();
    await request(app).post('/auth/register')
      .send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
    const loginRes = await request(app).post('/auth/login')
      .send({ email: 'ana@test.com', password: 'secret123' });
    const token = loginRes.body.token;

    const res = await request(app).post('/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .send({ refreshToken: 'any-raw-token-here' });
    expect(res.status).toBe(204);
  });
});
