import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubHighlightRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { errorHandler } from '../src/middleware/error.middleware';

jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({ decryptPayloadMiddleware: (_q: any, _s: any, n: any) => n() }));
jest.mock('../src/middleware/auth/verify-otp.middleware',      () => ({ verifyOtpMiddleware:      (_q: any, _s: any, n: any) => n() }));
jest.mock('../src/middleware/rate-limit.middleware',           () => ({ rateLimitMiddleware: () => (_q: any, _s: any, n: any) => n() }));
jest.mock('../src/lib/email', () => ({
  sendOtpEmail:     jest.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/lib/refresh-tokens', () => ({
  REFRESH_TTL: 86400, issueRefreshToken: jest.fn().mockResolvedValue('r'), validateAndRotate: jest.fn(),
  revokeRefreshToken: jest.fn().mockResolvedValue(undefined), invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));

function buildApp(users = new StubUserRepository()) {
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(users), new StubHighlightRepository()));
  app.use(errorHandler);
  return { app, users };
}

async function register(app: express.Express, email: string): Promise<string> {
  const res = await request(app).post('/auth/register').send({ name: 'Ana', email, password: 'secret123', otp: '123456' });
  expect(res.body.user.username).toBeNull();
  return res.body.token;
}

const put = (app: express.Express, t: string, body: object) =>
  request(app).put('/auth/profile').set('Authorization', `Bearer ${t}`).send(body);

describe('PUT /auth/profile — username', () => {
  it('sets a valid username (lowercased) and returns it', async () => {
    const { app } = buildApp();
    const t = await register(app, 'a@x.com');
    const res = await put(app, t, { username: 'Ana_Viaja' });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('ana_viaja');
  });

  it('400 USERNAME_NOT_ALLOWED for bad format or reserved word', async () => {
    const { app } = buildApp();
    const t = await register(app, 'a@x.com');
    for (const username of ['ab', 'an..a', 'admin', 'juan_puta']) {
      const res = await put(app, t, { username });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('USERNAME_NOT_ALLOWED');
    }
  });

  it('400 when trying to clear it', async () => {
    const { app } = buildApp();
    const t = await register(app, 'a@x.com');
    expect((await put(app, t, { username: null })).status).toBe(400);
    expect((await put(app, t, { username: '' })).status).toBe(400);
  });

  it('409 USERNAME_TAKEN when another user owns it; re-saving your own is fine', async () => {
    const { app } = buildApp();
    const t1 = await register(app, 'a@x.com');
    const t2 = await register(app, 'b@x.com');
    expect((await put(app, t1, { username: 'ana' })).status).toBe(200);
    const clash = await put(app, t2, { username: 'ana' });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toBe('USERNAME_TAKEN');
    expect((await put(app, t1, { username: 'ana' })).status).toBe(200);
  });

  it('409 when the DB unique index fires (rename race)', async () => {
    const { app, users } = buildApp();
    const t = await register(app, 'a@x.com');
    jest.spyOn(users, 'update').mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505', constraint: 'users_username_uidx' }));
    expect((await put(app, t, { username: 'ana' })).status).toBe(409);
  });

  it('an email-index unique violation is NOT reported as USERNAME_TAKEN', async () => {
    const { app, users } = buildApp();
    const t = await register(app, 'a@x.com');
    jest.spyOn(users, 'update').mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505', constraint: 'users_email_lower_uidx' }));
    const res = await put(app, t, { username: 'ana' });
    expect(res.status).toBe(500);
    expect(res.body.error).not.toBe('USERNAME_TAKEN');
  });

  it('login returns the username', async () => {
    const { app } = buildApp();
    const t = await register(app, 'a@x.com');
    await put(app, t, { username: 'ana' });
    const res = await request(app).post('/auth/login').send({ email: 'a@x.com', password: 'secret123' });
    expect(res.body.user.username).toBe('ana');
  });
});
