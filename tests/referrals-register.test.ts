import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { StubUserRepository, StubHighlightRepository, StubReferralRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { errorHandler } from '../src/middleware/error.middleware';
import { validateAndRotate } from '../src/lib/refresh-tokens';
import { capture } from '../src/lib/analytics';

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
jest.mock('../src/lib/analytics', () => ({ capture: jest.fn(), alias: jest.fn() }));

const ANON_REF = '11111111-1111-4111-8111-111111111111';
const ANON_NEW = '22222222-2222-4222-8222-222222222222';

let referrals: StubReferralRepository;
let app: express.Express;
let referrerId: string;
let code: string;

function userIdOf(token: string): string {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).userId;
}

const register = (email: string, extra: Record<string, unknown> = {}, anon?: string) => {
  const req = request(app).post('/auth/register');
  if (anon) req.set('X-Anonymous-Id', anon);
  return req.send({ name: 'Nuevo', email, password: 'secret123', otp: '123456', ...extra });
};

beforeEach(async () => {
  (capture as jest.Mock).mockClear();
  const users = new StubUserRepository();
  referrals = new StubReferralRepository(users);
  app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(users), new StubHighlightRepository(), referrals));
  app.use(errorHandler);
  const res = await request(app).post('/auth/register')
    .send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
  referrerId = userIdOf(res.body.token);
  code = await referrals.getOrCreateCode(referrerId);
});

describe('POST /auth/register — referral attribution (F81)', () => {
  it('a valid code + card channel attaches the new account', async () => {
    const res = await register('new@test.com', { referralCode: code, referralChannel: 'card' });
    expect(res.status).toBe(201);
    expect(referrals.rows.get(userIdOf(res.body.token))).toMatchObject({ referrer: referrerId, channel: 'card', sameBrowser: false });
    expect(capture).toHaveBeenCalledWith(expect.anything(), 'cta_referral_attributed', { channel: 'card', sameBrowser: false });
  });

  it("an X-Anonymous-Id the referrer used → sameBrowser true", async () => {
    await referrals.recordAnonymousId(referrerId, ANON_REF);
    const res = await register('new@test.com', { referralCode: code }, ANON_REF);
    expect(referrals.rows.get(userIdOf(res.body.token))).toMatchObject({ sameBrowser: true });
  });

  it('records the new account\'s own anon id only after attaching (not confused with the referrer)', async () => {
    const res = await register('new@test.com', { referralCode: code }, ANON_NEW);
    const id = userIdOf(res.body.token);
    expect(referrals.rows.get(id)).toMatchObject({ sameBrowser: false });
    expect(referrals.anonIds.get(id)?.has(ANON_NEW)).toBe(true);
  });

  it('no referralChannel → link', async () => {
    const res = await register('new@test.com', { referralCode: code });
    expect(referrals.rows.get(userIdOf(res.body.token))).toMatchObject({ channel: 'link' });
  });

  it.each([
    ['malformed code', { referralCode: 'ZZZ' }],
    ['unknown code', { referralCode: 'zzzzzzzz' }],
    ['bad channel', { referralCode: 'zzzzzzzz', referralChannel: 'email' }],
  ])('%s → 201, no row, no event', async (_n, extra) => {
    const res = await register('new@test.com', extra);
    expect(res.status).toBe(201);
    expect(referrals.rows.size).toBe(0);
    expect(capture).not.toHaveBeenCalledWith(expect.anything(), 'cta_referral_attributed', expect.anything());
  });

  it('attach throwing → 201', async () => {
    jest.spyOn(referrals, 'attach').mockRejectedValue(new Error('db down'));
    const res = await register('new@test.com', { referralCode: code });
    expect(res.status).toBe(201);
  });
});

describe('anonymous ids at login and refresh (F81)', () => {
  it('login with X-Anonymous-Id records it; without the header nothing', async () => {
    const spy = jest.spyOn(referrals, 'recordAnonymousId');
    await request(app).post('/auth/login').set('X-Anonymous-Id', ANON_REF).send({ email: 'ana@test.com', password: 'secret123' });
    expect(spy).toHaveBeenCalledWith(referrerId, ANON_REF);
    spy.mockClear();
    await request(app).post('/auth/login').send({ email: 'ana@test.com', password: 'secret123' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('refresh with X-Anonymous-Id records it', async () => {
    const spy = jest.spyOn(referrals, 'recordAnonymousId');
    (validateAndRotate as jest.Mock).mockResolvedValueOnce({ userId: referrerId, newRaw: 'rotated' });
    const res = await request(app).post('/auth/refresh')
      .set('Cookie', 'tb_refresh_token=valid-token-here-xx').set('X-Anonymous-Id', ANON_REF);
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(referrerId, ANON_REF);
  });

  it('recordAnonymousId throwing never fails login', async () => {
    jest.spyOn(referrals, 'recordAnonymousId').mockRejectedValue(new Error('db down'));
    const res = await request(app).post('/auth/login').set('X-Anonymous-Id', ANON_REF).send({ email: 'ana@test.com', password: 'secret123' });
    expect(res.status).toBe(200);
  });
});
