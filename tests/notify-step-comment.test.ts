import request from 'supertest';
import express from 'express';
import {
  StubUserRepository, StubStepCommentRepository, StubKarmaRepository, StubNotificationRepository,
} from './helpers/stubs';
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

jest.mock('../src/lib/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    on:  jest.fn(),
  },
  commentCooldownKey: (userId: string) => `USER_COMMENT_COOLDOWN:${userId}`,
  commentLastTextKey: (userId: string) => `USER_COMMENT_LAST:${userId}`,
  planSessionKey:     (userId: string, id: string) => `plan:${userId}:${id}`,
}));

const mockPoolQuery = jest.fn();
const mockPool = { query: mockPoolQuery } as any;

const VALID_SHARE_ID = 'share-abc';
const TRIP_ID        = 'trip-123';
const LONG_TEXT      = 'This is a sufficiently long comment that easily clears the fifty character minimum!';

function buildApp(notificationRepo = new StubNotificationRepository()) {
  const stepCommentRepo = new StubStepCommentRepository();
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(new StubUserRepository())));
  app.use('/shared/:shareId/comments',
    createSharedCommentsRouter(
      mockPool,
      new StepCommentController(stepCommentRepo),
      stepCommentRepo,
      new StubKarmaRepository(),
      notificationRepo,
    ),
  );
  app.use(errorHandler);
  return { app, notificationRepo };
}

async function getToken(app: express.Express, email = 'ana@test.com'): Promise<string> {
  const res = await request(app)
    .post('/auth/register')
    .send({ name: 'Ana', email, password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

function decodeUserId(token: string): string {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { userId: string };
  return payload.userId;
}

function setPoolFound(ownerId: string) {
  mockPoolQuery.mockResolvedValue({ rows: [{ trip_id: TRIP_ID, owner_id: ownerId }] });
}

beforeEach(() => {
  mockPoolQuery.mockReset();
});

describe('notification on step comment', () => {
  it('1 — non-owner comment → owner gets a comment notification with the share deep-link', async () => {
    const { app, notificationRepo } = buildApp();
    const token = await getToken(app);
    setPoolFound('owner-456');

    const res = await request(app)
      .post(`/shared/${VALID_SHARE_ID}/comments/step-1`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: LONG_TEXT });

    expect(res.status).toBe(201);
    const rows = await notificationRepo.listByUser('owner-456');
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('comment');
    expect(rows[0].url).toBe(`/?share=${VALID_SHARE_ID}`);
    expect(rows[0].body).toContain('Ana');
    expect(rows[0].read).toBe(false);
  });

  it('2 — owner comments on own trip → no notification', async () => {
    const { app, notificationRepo } = buildApp();
    const token = await getToken(app);
    setPoolFound(decodeUserId(token));

    const res = await request(app)
      .post(`/shared/${VALID_SHARE_ID}/comments/step-1`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: LONG_TEXT });

    expect(res.status).toBe(201);
    expect(notificationRepo.items).toHaveLength(0);
  });

  it('3 — muted owner → no notification, comment still 201', async () => {
    const { app, notificationRepo } = buildApp();
    const token = await getToken(app);
    setPoolFound('owner-456');
    await notificationRepo.setMuted('owner-456', true);

    const res = await request(app)
      .post(`/shared/${VALID_SHARE_ID}/comments/step-1`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: LONG_TEXT });

    expect(res.status).toBe(201);
    expect(notificationRepo.items).toHaveLength(0);
  });

  it('4 — repository failure → comment still 201', async () => {
    class ThrowingRepo extends StubNotificationRepository {
      override async add(): Promise<void> { throw new Error('db down'); }
    }
    const { app } = buildApp(new ThrowingRepo());
    const token = await getToken(app);
    setPoolFound('owner-456');

    const res = await request(app)
      .post(`/shared/${VALID_SHARE_ID}/comments/step-1`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: LONG_TEXT });

    expect(res.status).toBe(201);
  });
});
