import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubCommentRepository, StubHighlightRepository } from './helpers/stubs';
import { CommentController } from '../src/controllers/comment.controller';
import { UserController } from '../src/controllers/user.controller';
import { createCommentsRouter } from '../src/routes/comments.routes';
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

jest.mock('../src/lib/refresh-tokens', () => ({
  REFRESH_TTL:            86400,
  issueRefreshToken:      jest.fn().mockResolvedValue('mock-refresh-token'),
  validateAndRotate:      jest.fn(),
  revokeRefreshToken:     jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));

// Redis mock — overridden per test
const mockRedisGet = jest.fn<Promise<string | null>, [string]>();
const mockRedisSet = jest.fn().mockResolvedValue('OK');

jest.mock('../src/lib/redis', () => ({
  redis: {
    get: (key: string) => mockRedisGet(key),
    set: (...args: any[]) => mockRedisSet(...args),
    on: jest.fn(),
  },
  commentCooldownKey: (userId: string) => `USER_COMMENT_COOLDOWN:${userId}`,
  commentLastTextKey: (userId: string) => `USER_COMMENT_LAST:${userId}`,
  planSessionKey: (userId: string, id: string) => `plan:${userId}:${id}`,
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth',     createAuthRouter(new UserController(new StubUserRepository()), new StubHighlightRepository()));
  app.use('/comments', createCommentsRouter(new CommentController(new StubCommentRepository())));
  app.use(errorHandler);
  return app;
}

async function getToken(app: express.Express, email = 'ana@test.com'): Promise<string> {
  const res = await request(app).post('/auth/register').send({ name: 'Ana', email, password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

const VALID_COMMENT = { text: 'Amazing place!', rating: 5, color: '#F472B6', date: 'Apr 24' };

beforeEach(() => {
  mockRedisGet.mockReset();
  mockRedisSet.mockReset().mockResolvedValue('OK');
});

describe('Comment spam prevention', () => {
  it('1. First comment ever (no Redis data) → 201', async () => {
    mockRedisGet.mockResolvedValue(null);
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_COMMENT);
    expect(res.status).toBe(201);
  });

  it('2. Second comment within 60 s → 429 TOO_SOON with retryAfterSeconds', async () => {
    const postedAt = Math.floor(Date.now() / 1000) - 10; // 10 s ago
    mockRedisGet.mockImplementation((key: string) => {
      if (key.startsWith('USER_COMMENT_COOLDOWN:')) return Promise.resolve(postedAt.toString());
      return Promise.resolve(null);
    });
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_COMMENT);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('TOO_SOON');
    expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(res.body.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('3. Comment after cooldown expires (Redis returns null) → 201', async () => {
    mockRedisGet.mockResolvedValue(null);
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_COMMENT, text: 'Totally different!' });
    expect(res.status).toBe(201);
  });

  it('4. Identical text to last comment → 409 TOO_SIMILAR', async () => {
    mockRedisGet.mockImplementation((key: string) => {
      if (key.startsWith('USER_COMMENT_LAST:')) return Promise.resolve(VALID_COMMENT.text);
      return Promise.resolve(null);
    });
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_COMMENT);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('TOO_SIMILAR');
  });

  it('5. Text 10% different from last → 409 TOO_SIMILAR', async () => {
    const lastText = 'Amazing place to visit!';
    const similarText = 'Amazing place to visit.'; // ~4% different
    mockRedisGet.mockImplementation((key: string) => {
      if (key.startsWith('USER_COMMENT_LAST:')) return Promise.resolve(lastText);
      return Promise.resolve(null);
    });
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_COMMENT, text: similarText });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('TOO_SIMILAR');
  });

  it('6. Text 30% different from last → 201', async () => {
    const lastText = 'Great view from the top!';
    const differentText = 'A wonderful experience with breathtaking architecture and history';
    mockRedisGet.mockImplementation((key: string) => {
      if (key.startsWith('USER_COMMENT_LAST:')) return Promise.resolve(lastText);
      return Promise.resolve(null);
    });
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_COMMENT, text: differentText });
    expect(res.status).toBe(201);
  });

  it('7. Redis throws on cooldown read → 201 (check skipped)', async () => {
    mockRedisGet.mockImplementation((key: string) => {
      if (key.startsWith('USER_COMMENT_COOLDOWN:')) return Promise.reject(new Error('Redis down'));
      return Promise.resolve(null);
    });
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_COMMENT);
    expect(res.status).toBe(201);
  });

  it('8. Redis throws on similarity read → 201 (check skipped)', async () => {
    mockRedisGet.mockImplementation((key: string) => {
      if (key.startsWith('USER_COMMENT_COOLDOWN:')) return Promise.resolve(null);
      return Promise.reject(new Error('Redis down'));
    });
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_COMMENT);
    expect(res.status).toBe(201);
  });
});
