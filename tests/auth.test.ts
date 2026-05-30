import request from 'supertest';
import express from 'express';
import { StubUserRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
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
  });

  it('returns 401 for wrong password', async () => {
    const app = buildApp();
    await request(app).post('/auth/register').send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
    expect((await request(app).post('/auth/login').send({ email: 'ana@test.com', password: 'wrong' })).status).toBe(401);
  });

  it('returns 401 for unknown email', async () => {
    expect((await request(buildApp()).post('/auth/login').send({ email: 'nobody@test.com', password: 'x' })).status).toBe(401);
  });
});
