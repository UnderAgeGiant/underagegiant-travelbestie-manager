import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { StubUserRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { errorHandler } from '../src/middleware/error.middleware';
import { validateAndRotate } from '../src/lib/refresh-tokens';

jest.mock('../src/lib/refresh-tokens', () => ({
  REFRESH_TTL:            86400,
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
  app.use(cookieParser());
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(new StubUserRepository())));
  app.use(errorHandler);
  return app;
}

describe('POST /auth/register', () => {
  it('registers a user, returns token + public user, sets refresh cookie', async () => {
    const res = await request(buildApp()).post('/auth/register')
      .send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeUndefined();           // no longer in the body
    expect(res.headers['set-cookie'][0]).toContain('tb_refresh_token=mock-refresh-token');
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
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
  it('returns token for valid credentials and sets refresh cookie', async () => {
    const app = buildApp();
    await request(app).post('/auth/register').send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
    const res = await request(app).post('/auth/login').send({ email: 'ana@test.com', password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.headers['set-cookie'][0]).toContain('tb_refresh_token=mock-refresh-token');
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
  it('returns 401 when no refresh cookie is present', async () => {
    const res = await request(buildApp()).post('/auth/refresh').send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_REFRESH_TOKEN');
  });

  it('returns 401 when the refresh token is invalid', async () => {
    mockValidateAndRotate.mockResolvedValueOnce(null);
    const res = await request(buildApp()).post('/auth/refresh')
      .set('Cookie', 'tb_refresh_token=invalid-token-here');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_REFRESH_TOKEN');
  });

  it('returns 200 with a new token and a rotated refresh cookie for a valid token', async () => {
    const app = buildApp();
    const regRes = await request(app).post('/auth/register')
      .send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
    const b64 = regRes.body.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const userId = JSON.parse(Buffer.from(b64, 'base64').toString()).userId;

    mockValidateAndRotate.mockResolvedValueOnce({ userId, newRaw: 'rotated-raw-token' });

    const res = await request(app).post('/auth/refresh')
      .set('Cookie', 'tb_refresh_token=valid-token-here-xx');
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.headers['set-cookie'][0]).toContain('tb_refresh_token=rotated-raw-token');
    expect(res.body.user.name).toBe('Ana');
  });
});

describe('POST /auth/logout', () => {
  it('returns 401 without a Bearer token', async () => {
    const res = await request(buildApp()).post('/auth/logout')
      .set('Cookie', 'tb_refresh_token=any-token-here-xx');
    expect(res.status).toBe(401);
  });

  it('returns 204 and clears the cookie for a logged-in user', async () => {
    const app = buildApp();
    await request(app).post('/auth/register')
      .send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
    const loginRes = await request(app).post('/auth/login')
      .send({ email: 'ana@test.com', password: 'secret123' });
    const token = loginRes.body.token;

    const res = await request(app).post('/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', 'tb_refresh_token=any-raw-token-here');
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie'][0]).toMatch(/tb_refresh_token=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
});
