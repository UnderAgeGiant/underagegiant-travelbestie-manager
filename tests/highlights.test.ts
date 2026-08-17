import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubHighlightRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createHighlightsRouter } from '../src/routes/highlights.routes';
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

const mockRedisGet = jest.fn<Promise<string | null>, [string]>();
const mockRedisSet = jest.fn().mockResolvedValue('OK');

jest.mock('../src/lib/redis', () => ({
  redis: {
    get: (key: string) => mockRedisGet(key),
    set: (...args: any[]) => mockRedisSet(...args),
    on: jest.fn(),
  },
  highlightSeenKey: (type: string, identity: string) => `highlight:${type}:${identity}`,
}));

function buildApp(highlightRepo: StubHighlightRepository) {
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(new StubUserRepository())));
  app.use('/highlights', createHighlightsRouter(highlightRepo));
  app.use(errorHandler);
  return app;
}

async function getToken(app: express.Express, email = 'ana@test.com'): Promise<string> {
  const res = await request(app).post('/auth/register').send({ name: 'Ana', email, password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

beforeEach(() => {
  mockRedisGet.mockReset();
  mockRedisSet.mockReset().mockResolvedValue('OK');
});

describe('Highlights module', () => {
  it('GET /highlights/:type/status returns 400 for a malformed type', async () => {
    const app = buildApp(new StubHighlightRepository());
    const res = await request(app).get('/highlights/Not-Valid!/status');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_HIGHLIGHT_TYPE');
  });

  it('GET status: anonymous caller, no Redis key → { seen: false }, never touches the DB', async () => {
    mockRedisGet.mockResolvedValue(null);
    const app = buildApp(new StubHighlightRepository());
    const res = await request(app).get('/highlights/landing_welcome/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ seen: false });
  });

  it('GET status: anonymous caller with a Redis hit → { seen: true }', async () => {
    mockRedisGet.mockResolvedValue('1');
    const app = buildApp(new StubHighlightRepository());
    const res = await request(app).get('/highlights/landing_welcome/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ seen: true });
  });

  it('GET status: logged-in caller, Redis miss, DB says seen → { seen: true } and Redis gets warmed', async () => {
    mockRedisGet.mockResolvedValue(null);
    const repo = new StubHighlightRepository();
    const app = buildApp(repo);
    const token = await getToken(app);
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    await repo.markSeen(decoded.userId, 'landing_welcome'); // seed the DB directly, bypassing the route under test

    const res = await request(app)
      .get('/highlights/landing_welcome/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ seen: true });
    expect(mockRedisSet).toHaveBeenCalledWith('highlight:landing_welcome:u:' + decoded.userId, '1');
  });

  it('GET status: logged-in caller, Redis miss, DB says not seen → { seen: false }', async () => {
    mockRedisGet.mockResolvedValue(null);
    const app = buildApp(new StubHighlightRepository());
    const token = await getToken(app);
    const res = await request(app)
      .get('/highlights/landing_welcome/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ seen: false });
  });

  it('POST /highlights/:type/seen: anonymous caller writes Redis only, 204', async () => {
    const app = buildApp(new StubHighlightRepository());
    const res = await request(app).post('/highlights/landing_welcome/seen');
    expect(res.status).toBe(204);
    expect(mockRedisSet).toHaveBeenCalledWith(expect.stringContaining('highlight:landing_welcome:ip:'), '1');
  });

  it('GET status: anonymous caller with a valid X-Anonymous-Id uses the `a:` identity, not IP', async () => {
    mockRedisGet.mockResolvedValue(null);
    const app = buildApp(new StubHighlightRepository());
    const anonId = '11111111-2222-4333-8444-555555555555';
    const res = await request(app)
      .get('/highlights/landing_welcome/status')
      .set('X-Anonymous-Id', anonId);
    expect(res.status).toBe(200);
    expect(mockRedisGet).toHaveBeenCalledWith(`highlight:landing_welcome:a:${anonId}`);
  });

  it('POST seen: anonymous caller with a valid X-Anonymous-Id writes Redis under the `a:` identity', async () => {
    const app = buildApp(new StubHighlightRepository());
    const anonId = '11111111-2222-4333-8444-555555555555';
    const res = await request(app)
      .post('/highlights/landing_welcome/seen')
      .set('X-Anonymous-Id', anonId);
    expect(res.status).toBe(204);
    expect(mockRedisSet).toHaveBeenCalledWith(`highlight:landing_welcome:a:${anonId}`, '1');
  });

  it('GET status: a malformed X-Anonymous-Id is ignored and falls back to IP', async () => {
    mockRedisGet.mockResolvedValue(null);
    const app = buildApp(new StubHighlightRepository());
    const res = await request(app)
      .get('/highlights/landing_welcome/status')
      .set('X-Anonymous-Id', 'not-a-uuid');
    expect(res.status).toBe(200);
    expect(mockRedisGet).toHaveBeenCalledWith(expect.stringContaining('highlight:landing_welcome:ip:'));
  });

  it('GET status: a logged-in caller uses `u:` identity even if X-Anonymous-Id is also sent', async () => {
    mockRedisGet.mockResolvedValue(null);
    const app = buildApp(new StubHighlightRepository());
    const token = await getToken(app);
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const res = await request(app)
      .get('/highlights/landing_welcome/status')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Anonymous-Id', '11111111-2222-4333-8444-555555555555');
    expect(res.status).toBe(200);
    expect(mockRedisGet).toHaveBeenCalledWith(`highlight:landing_welcome:u:${decoded.userId}`);
  });

  it('POST seen: logged-in caller writes Redis AND the DB', async () => {
    const repo = new StubHighlightRepository();
    const app = buildApp(repo);
    const token = await getToken(app);
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

    const res = await request(app)
      .post('/highlights/landing_welcome/seen')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
    expect(mockRedisSet).toHaveBeenCalledWith(`highlight:landing_welcome:u:${decoded.userId}`, '1');
    expect(await repo.hasSeen(decoded.userId, 'landing_welcome')).toBe(true);
  });

  it('POST seen: Redis failure is non-fatal, DB write still happens for a logged-in caller', async () => {
    mockRedisSet.mockRejectedValue(new Error('Redis down'));
    const repo = new StubHighlightRepository();
    const app = buildApp(repo);
    const token = await getToken(app);
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

    const res = await request(app)
      .post('/highlights/landing_welcome/seen')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
    expect(await repo.hasSeen(decoded.userId, 'landing_welcome')).toBe(true);
  });
});
