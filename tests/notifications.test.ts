import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubNotificationRepository, StubHighlightRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createNotificationsRouter } from '../src/routes/notifications.routes';
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

function buildApp() {
  const notificationRepo = new StubNotificationRepository();
  const app = express();
  app.use(express.json());
  app.use('/auth',          createAuthRouter(new UserController(new StubUserRepository()), new StubHighlightRepository()));
  app.use('/notifications', createNotificationsRouter(notificationRepo));
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

describe('GET /notifications', () => {
  it('1 — no token → 401', async () => {
    const { app } = buildApp();
    expect((await request(app).get('/notifications')).status).toBe(401);
  });

  it('2 — returns only own notifications, newest first', async () => {
    const { app, notificationRepo } = buildApp();
    const token = await getToken(app);
    const userId = decodeUserId(token);
    await notificationRepo.add({ userId, type: 'comment', title: 'Viejo', body: 'b1', url: '/?share=a' });
    await notificationRepo.add({ userId, type: 'favorite', title: 'Nuevo', body: 'b2', url: '/?share=a' });
    await notificationRepo.add({ userId: 'someone-else', type: 'comment', title: 'Ajeno', body: 'b3', url: '/' });

    const res = await request(app).get('/notifications').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(2);
    expect(res.body.notifications[0].title).toBe('Nuevo');
    expect(res.body.notifications[1].title).toBe('Viejo');
  });
});

describe('GET /notifications/status', () => {
  it('3 — returns unread count and mute flag', async () => {
    const { app, notificationRepo } = buildApp();
    const token = await getToken(app);
    const userId = decodeUserId(token);
    await notificationRepo.add({ userId, type: 'comment', title: 't', body: 'b', url: '/' });

    const res = await request(app).get('/notifications/status').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 1, muted: false });
  });
});

describe('POST /notifications/read', () => {
  it('4 — marks all read → 204, status count drops to 0', async () => {
    const { app, notificationRepo } = buildApp();
    const token = await getToken(app);
    const userId = decodeUserId(token);
    await notificationRepo.add({ userId, type: 'comment', title: 't', body: 'b', url: '/' });

    const res = await request(app).post('/notifications/read').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    const status = await request(app).get('/notifications/status').set('Authorization', `Bearer ${token}`);
    expect(status.body.count).toBe(0);
  });
});

describe('PUT /notifications/mute', () => {
  it('5 — muted:true → 200 and subsequent adds are skipped', async () => {
    const { app, notificationRepo } = buildApp();
    const token = await getToken(app);
    const userId = decodeUserId(token);

    const res = await request(app)
      .put('/notifications/mute')
      .set('Authorization', `Bearer ${token}`)
      .send({ muted: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ muted: true });

    await notificationRepo.add({ userId, type: 'comment', title: 't', body: 'b', url: '/' });
    expect(notificationRepo.items).toHaveLength(0);

    const status = await request(app).get('/notifications/status').set('Authorization', `Bearer ${token}`);
    expect(status.body.muted).toBe(true);
  });

  it('6 — non-boolean body → 400', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .put('/notifications/mute')
      .set('Authorization', `Bearer ${token}`)
      .send({ muted: 'yes' });
    expect(res.status).toBe(400);
  });
});
