import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubCommentRepository, StubKarmaRepository, StubHighlightRepository } from './helpers/stubs';
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

// Real Redis is unavailable in this test environment; without a mock every
// cooldown/similarity/cache check waits out the full connectTimeout before
// falling open, making this file take minutes instead of seconds. This mock
// keeps the exact same "cache miss / no cooldown / no similarity match" shape
// the real fail-open path produces, just without the network wait.
jest.mock('../src/lib/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    mget: (...keys: string[]) => Promise.resolve(keys.map(() => null)),
    pipeline: () => ({ set: () => undefined, exec: () => Promise.resolve([]) }),
    on: jest.fn(),
  },
  commentCooldownKey: (userId: string) => `comment:cooldown:${userId}`,
  commentLastTextKey: (userId: string) => `comment:last:${userId}`,
  commentCacheKey: (attractionId: string) => `comments:att:${attractionId}`,
  COMMENT_CACHE_TTL: 60,
}));

function buildApp() {
  const commentRepo = new StubCommentRepository();
  const karmaRepo = new StubKarmaRepository();
  const app = express();
  app.use(express.json());
  app.use('/auth',     createAuthRouter(new UserController(new StubUserRepository()), new StubHighlightRepository()));
  app.use('/comments', createCommentsRouter(new CommentController(commentRepo), commentRepo, karmaRepo));
  app.use(errorHandler);
  return { app, karmaRepo };
}

async function getToken(app: express.Express, email = 'ana@test.com'): Promise<string> {
  const res = await request(app).post('/auth/register').send({ name: 'Ana', email, password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

describe('GET /comments/:attractionId', () => {
  it('returns empty array when no comments (public)', async () => {
    const res = await request(buildApp().app).get('/comments/paris_0');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /comments/:attractionId', () => {
  it('returns 401 without token', async () => {
    const res = await request(buildApp().app).post('/comments/paris_0')
      .send({ text: 'Breathtaking!', rating: 5, color: '#F472B6', date: 'Apr 24' });
    expect(res.status).toBe(401);
  });

  it('creates a comment and uses name from JWT (not body)', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const res = await request(app).post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'SPOOFED NAME', text: 'Breathtaking!', rating: 5, color: '#F472B6', date: 'Apr 24' });
    expect(res.status).toBe(201);
    expect(res.body.attractionId).toBe('paris_0');
    expect(res.body.name).toBe('Ana');
  });

  it('returns 400 when rating is out of range', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    expect((await request(app).post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'ok', rating: 6, color: '#fff', date: 'Apr 24' })).status).toBe(400);
  });

  it('persists comment so GET returns it', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    await request(app).post('/comments/rome_0')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Lovely!', rating: 4, color: '#34D399', date: 'Apr 24' });
    expect((await request(app).get('/comments/rome_0')).body[0].name).toBe('Ana');
  });

  it('awards +1 karma with reason attraction_comment_first on a user\'s first comment on an attraction', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);
    const res = await request(app).post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'First comment!', rating: 5, color: '#F472B6', date: 'Apr 24' });

    expect(res.status).toBe(201);
    expect(karmaRepo.awarded).toHaveLength(1);
    expect(karmaRepo.awarded[0].amount).toBe(1);
    expect(karmaRepo.awarded[0].reason).toBe('attraction_comment_first');
    expect(karmaRepo.awarded[0].refId).toBe(res.body.id);
  });

  it('awards no karma on a second comment by the same user on the same attraction', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);
    await request(app).post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'First comment!', rating: 5, color: '#F472B6', date: 'Apr 24' });
    const res = await request(app).post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Totally different second comment text here', rating: 4, color: '#34D399', date: 'Apr 25' });

    expect(res.status).toBe(201);
    expect(karmaRepo.awarded).toHaveLength(1);
  });

  it('still awards +1 karma to a different user commenting on the same attraction (per-user, not per-attraction-global)', async () => {
    const { app, karmaRepo } = buildApp();
    const tokenA = await getToken(app, 'ana@test.com');
    const tokenB = await getToken(app, 'bea@test.com');
    await request(app).post('/comments/paris_0')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'First comment!', rating: 5, color: '#F472B6', date: 'Apr 24' });
    const res = await request(app).post('/comments/paris_0')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ text: 'Different user, different comment', rating: 4, color: '#34D399', date: 'Apr 25' });

    expect(res.status).toBe(201);
    expect(karmaRepo.awarded).toHaveLength(2);
    expect(karmaRepo.awarded[1].reason).toBe('attraction_comment_first');
  });
});

describe('GET /comments?ids=...', () => {
  it('returns empty arrays for attractions with no comments', async () => {
    const res = await request(buildApp().app).get('/comments?ids=paris_0,paris_1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ paris_0: [], paris_1: [] });
  });

  it('returns comments after they are posted', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    await request(app).post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Nice!', rating: 5, color: '#F472B6', date: 'Jun 10' });

    const res = await request(app).get('/comments?ids=paris_0,paris_1');
    expect(res.status).toBe(200);
    expect(res.body.paris_0).toHaveLength(1);
    expect(res.body.paris_0[0].text).toBe('Nice!');
    expect(res.body.paris_1).toEqual([]);
  }, 30000); // Redis cooldown+similarity+cache each wait up to connectTimeout when unavailable

  it('deduplicates repeated ids', async () => {
    const res = await request(buildApp().app).get('/comments?ids=paris_0,paris_0,paris_0');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['paris_0']);
  }, 30000); // Redis cache falls through to DB when unavailable; connectTimeout adds latency

  it('returns 400 when ids param is absent', async () => {
    const res = await request(buildApp().app).get('/comments');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ids query param required');
  });

  it('returns 400 when ids param is empty string', async () => {
    const res = await request(buildApp().app).get('/comments?ids=');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ids query param required');
  });

  it('returns 400 when more than 50 ids are sent', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `att_${i}`).join(',');
    const res = await request(buildApp().app).get(`/comments?ids=${ids}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('too many ids');
  });

  it('returns 200 with exactly 50 ids (boundary)', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `att_${i}`).join(',');
    const res = await request(buildApp().app).get(`/comments?ids=${ids}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toHaveLength(50);
  });
});
