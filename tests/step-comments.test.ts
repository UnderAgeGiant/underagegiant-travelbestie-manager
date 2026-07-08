import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubStepCommentRepository, StubKarmaRepository, StubNotificationRepository } from './helpers/stubs';
import { StepCommentController } from '../src/controllers/step-comment.controller';
import { UserController } from '../src/controllers/user.controller';
import { createSharedCommentsRouter } from '../src/routes/shared-comments.routes';
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

const mockPoolQuery = jest.fn();
const mockPool = { query: mockPoolQuery } as any;

const VALID_SHARE_ID = 'share-abc';
const TRIP_ID        = 'trip-123';
const OTHER_OWNER_ID = 'owner-456';

function buildApp(stepCommentRepo = new StubStepCommentRepository(), karmaRepo = new StubKarmaRepository()) {
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(new StubUserRepository())));
  app.use('/shared/:shareId/comments',
    createSharedCommentsRouter(
      mockPool,
      new StepCommentController(stepCommentRepo),
      stepCommentRepo,
      karmaRepo,
      new StubNotificationRepository(),
    ),
  );
  app.use(errorHandler);
  return app;
}

async function getToken(app: express.Express, email = 'ana@test.com'): Promise<string> {
  const res = await request(app).post('/auth/register').send({ name: 'Ana', email, password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

function decodeUserId(token: string): string {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { userId: string };
  return payload.userId;
}

function setPoolFound(ownerId = OTHER_OWNER_ID) {
  mockPoolQuery.mockResolvedValue({ rows: [{ trip_id: TRIP_ID, owner_id: ownerId }] });
}

function setPoolNotFound() {
  mockPoolQuery.mockResolvedValue({ rows: [] });
}

const LONG_TEXT  = 'This is a sufficiently long comment that easily clears the fifty character minimum!';
const SHORT_TEXT = 'Too short';

beforeEach(() => {
  mockRedisGet.mockReset().mockResolvedValue(null);
  mockRedisSet.mockReset().mockResolvedValue('OK');
  mockPoolQuery.mockReset();
});

describe('Step comments', () => {
  it('1. GET valid shareId → 200 grouped map', async () => {
    setPoolFound();
    const app = buildApp();
    const token = await getToken(app);
    // Post a comment first so there's data to return
    await request(app)
      .post(`/shared/${VALID_SHARE_ID}/comments/stop:paris`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: LONG_TEXT });

    const res = await request(app).get(`/shared/${VALID_SHARE_ID}/comments`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('stop:paris');
    expect(Array.isArray(res.body['stop:paris'])).toBe(true);
    expect(res.body['stop:paris'][0].text).toBe(LONG_TEXT);
  });

  it('2. GET unknown shareId → 404', async () => {
    setPoolNotFound();
    const app = buildApp();
    const res = await request(app).get('/shared/bad-share/comments');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Shared trip not found');
  });

  it('3. POST valid text, first comment → 201 karmaAwarded: true', async () => {
    setPoolFound();
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post(`/shared/${VALID_SHARE_ID}/comments/stop:paris`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: LONG_TEXT });
    expect(res.status).toBe(201);
    expect(res.body.comment.text).toBe(LONG_TEXT);
    expect(res.body.comment.stepKey).toBe('stop:paris');
    expect(res.body.karmaAwarded).toBe(true);
  });

  it('4. POST second comment on same step by same user → 201 karmaAwarded: false', async () => {
    setPoolFound();
    const stepCommentRepo = new StubStepCommentRepository();
    const app = buildApp(stepCommentRepo);
    const token = await getToken(app);

    // First comment
    await request(app)
      .post(`/shared/${VALID_SHARE_ID}/comments/stop:paris`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: LONG_TEXT });

    // Redis cooldown must be cleared for second attempt
    mockRedisGet.mockResolvedValue(null);

    // Second comment — karma slot already taken
    const res = await request(app)
      .post(`/shared/${VALID_SHARE_ID}/comments/stop:paris`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Another long comment that passes the fifty character minimum requirement here.' });
    expect(res.status).toBe(201);
    expect(res.body.karmaAwarded).toBe(false);
  });

  it('5. POST trip owner commenting → 201 karmaAwarded: false', async () => {
    const app = buildApp();
    const token = await getToken(app);
    const ownerId = decodeUserId(token);
    // Re-configure pool to return this user as the owner
    mockPoolQuery.mockResolvedValue({ rows: [{ trip_id: TRIP_ID, owner_id: ownerId }] });

    const res = await request(app)
      .post(`/shared/${VALID_SHARE_ID}/comments/stop:paris`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: LONG_TEXT });
    expect(res.status).toBe(201);
    expect(res.body.karmaAwarded).toBe(false);
  });

  it('6. POST text < 50 chars → 400', async () => {
    setPoolFound();
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post(`/shared/${VALID_SHARE_ID}/comments/stop:paris`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: SHORT_TEXT });
    expect(res.status).toBe(400);
  });

  it('7. POST unauthenticated → 401', async () => {
    const app = buildApp();
    const res = await request(app)
      .post(`/shared/${VALID_SHARE_ID}/comments/stop:paris`)
      .send({ text: LONG_TEXT });
    expect(res.status).toBe(401);
  });

  it('8. POST unknown shareId → 404', async () => {
    setPoolNotFound();
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post('/shared/bad-share/comments/stop:paris')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: LONG_TEXT });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Shared trip not found');
  });

  it('9. POST within 60 s cooldown → 429 TOO_SOON', async () => {
    setPoolFound();
    const postedAt = Math.floor(Date.now() / 1000) - 10; // 10 s ago
    mockRedisGet.mockImplementation((key: string) => {
      if (key.startsWith('USER_COMMENT_COOLDOWN:')) return Promise.resolve(postedAt.toString());
      return Promise.resolve(null);
    });
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post(`/shared/${VALID_SHARE_ID}/comments/stop:paris`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: LONG_TEXT });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('TOO_SOON');
    expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('10. POST text too similar to last comment → 409 TOO_SIMILAR', async () => {
    setPoolFound();
    mockRedisGet.mockImplementation((key: string) => {
      if (key.startsWith('USER_COMMENT_LAST:')) return Promise.resolve(LONG_TEXT);
      return Promise.resolve(null);
    });
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post(`/shared/${VALID_SHARE_ID}/comments/stop:paris`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: LONG_TEXT });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('TOO_SIMILAR');
  });
});
