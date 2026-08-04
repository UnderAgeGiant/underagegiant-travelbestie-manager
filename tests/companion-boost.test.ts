import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubKarmaRepository } from './helpers/stubs';
import { UserController }      from '../src/controllers/user.controller';
import { KarmaController }     from '../src/controllers/karma.controller';
import { CompanionController } from '../src/controllers/companion.controller';
import { createAuthRouter }      from '../src/routes/auth.routes';
import { createCompanionRouter } from '../src/routes/companion.routes';
import { errorHandler } from '../src/middleware/error.middleware';

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

const mockRedisTtl = jest.fn().mockResolvedValue(-2); // -2 = key doesn't exist (ioredis TTL semantics)
const mockRedisSet = jest.fn().mockResolvedValue('OK');

jest.mock('../src/lib/redis', () => ({
  redis: {
    ttl: (key: string) => mockRedisTtl(key),
    set: (...args: any[]) => mockRedisSet(...args),
  },
}));

function buildApp() {
  const karmaRepo = new StubKarmaRepository(100);
  const app = express();
  app.use(express.json());
  app.use('/auth',      createAuthRouter(new UserController(new StubUserRepository())));
  app.use('/companion', createCompanionRouter(new CompanionController(), new KarmaController(karmaRepo)));
  app.use(errorHandler);
  return { app, karmaRepo };
}

async function getToken(app: express.Express): Promise<string> {
  const res = await request(app)
    .post('/auth/register')
    .send({ name: 'Tester', email: 'companion-boost@test.com', password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

describe('POST /companion/boost', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 with no Authorization header', async () => {
    const { app } = buildApp();
    const res = await request(app).post('/companion/boost');
    expect(res.status).toBe(401);
  });

  it('returns 402 when the user has less than 2 karma', async () => {
    const { app, karmaRepo } = buildApp();
    karmaRepo.setScore(1);
    const token = await getToken(app);
    const res = await request(app).post('/companion/boost').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(402);
  });

  it('sets the boost flag in Redis with an 86400s EX TTL and returns secondsRemaining', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const res = await request(app).post('/companion/boost').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ boosted: true, secondsRemaining: 86400 });
    expect(mockRedisSet).toHaveBeenCalledWith(
      expect.stringMatching(/^companion:boost:/),
      '1',
      'EX',
      86400,
    );
  });
});

describe('GET /companion/status', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 with no Authorization header', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/companion/status');
    expect(res.status).toBe(401);
  });

  it('returns { boosted: false, secondsRemaining: 0 } when no flag is set (TTL -2)', async () => {
    const { app } = buildApp();
    mockRedisTtl.mockResolvedValue(-2);
    const token = await getToken(app);
    const res = await request(app).get('/companion/status').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ boosted: false, secondsRemaining: 0 });
  });

  it('returns { boosted: true, secondsRemaining } when the flag is set', async () => {
    const { app } = buildApp();
    mockRedisTtl.mockResolvedValue(43200); // 12 hours left
    const token = await getToken(app);
    const res = await request(app).get('/companion/status').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ boosted: true, secondsRemaining: 43200 });
  });

  it('degrades to { boosted: false, secondsRemaining: 0 } on a Redis error rather than failing', async () => {
    const { app } = buildApp();
    mockRedisTtl.mockRejectedValue(new Error('Redis down'));
    const token = await getToken(app);
    const res = await request(app).get('/companion/status').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ boosted: false, secondsRemaining: 0 });
  });
});
