import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubHighlightRepository, StubReferralRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { ReferralController } from '../src/controllers/referral.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createReferralsRouter } from '../src/routes/referrals.routes';
import { errorHandler } from '../src/middleware/error.middleware';
import { REFERRAL_CODE_RE } from '../src/lib/referrals';

jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({
  decryptPayloadMiddleware: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../src/middleware/auth/verify-otp.middleware', () => ({
  verifyOtpMiddleware: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../src/lib/refresh-tokens', () => ({
  REFRESH_TTL:            86400,
  issueRefreshToken:      jest.fn().mockResolvedValue('mock-refresh-token'),
  validateAndRotate:      jest.fn(),
  revokeRefreshToken:     jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/lib/analytics', () => ({ capture: jest.fn(), alias: jest.fn() }));

const counters = new Map<string, number>();
jest.mock('../src/lib/redis', () => ({
  redis: {
    incr:   jest.fn(async (k: string) => { counters.set(k, (counters.get(k) ?? 0) + 1); return counters.get(k); }),
    expire: jest.fn(async () => 1),
    get:    jest.fn(async () => null),
    set:    jest.fn(async () => 'OK'),
  },
}));

let app: express.Express;
let referrals: StubReferralRepository;
let token: string;

beforeEach(async () => {
  counters.clear();
  const users = new StubUserRepository();
  referrals = new StubReferralRepository(users);
  app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(users), new StubHighlightRepository()));
  app.use('/referrals', createReferralsRouter(new ReferralController(referrals)));
  app.use(errorHandler);
  const res = await request(app).post('/auth/register')
    .send({ name: 'Ana María Pérez', email: 'ana@test.com', password: 'secret123', otp: '123456' });
  token = res.body.token;
});

describe('GET /referrals/me (F81 §19.1)', () => {
  it('401 without a token', async () => {
    expect((await request(app).get('/referrals/me')).status).toBe(401);
  });

  it('returns exactly the contract keys and a stable code', async () => {
    const a = await request(app).get('/referrals/me').set('Authorization', `Bearer ${token}`);
    expect(a.status).toBe(200);
    expect(Object.keys(a.body).sort()).toEqual(['capResetsOn', 'code', 'invitedCount', 'monthCap', 'monthTokens', 'rewardTokens']);
    expect(a.body).toMatchObject({ invitedCount: 0, monthTokens: 0, rewardTokens: 10, monthCap: 100 });
    expect(a.body.code).toMatch(REFERRAL_CODE_RE);
    const b = await request(app).get('/referrals/me').set('Authorization', `Bearer ${token}`);
    expect(b.body.code).toBe(a.body.code);
  });
});

describe('GET /referrals/:code (F81 §19.2)', () => {
  it('200 with exactly username + first name', async () => {
    const me = await request(app).get('/referrals/me').set('Authorization', `Bearer ${token}`);
    const res = await request(app).get(`/referrals/${me.body.code}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: null, firstName: 'Ana' });
  });

  it.each(['ZZZ', 'zzzzzzzz'])('404 not_found for %s', async code => {
    const res = await request(app).get(`/referrals/${code}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it('the 21st lookup in the window → 429', async () => {
    for (let i = 0; i < 20; i++) expect((await request(app).get('/referrals/zzzzzzzz')).status).toBe(404);
    expect((await request(app).get('/referrals/zzzzzzzz')).status).toBe(429);
  });
});
