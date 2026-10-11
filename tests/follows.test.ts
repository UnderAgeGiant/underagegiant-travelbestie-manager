import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubHighlightRepository, StubFollowRepository, StubNotificationRepository, StubTrophyRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createUsersRouter } from '../src/routes/users.routes';
import { TrophyRecorder } from '../src/lib/trophy-recorder';
import { errorHandler } from '../src/middleware/error.middleware';

jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({ decryptPayloadMiddleware: (_q: any, _s: any, n: any) => n() }));
jest.mock('../src/middleware/auth/verify-otp.middleware',      () => ({ verifyOtpMiddleware:      (_q: any, _s: any, n: any) => n() }));
jest.mock('../src/middleware/rate-limit.middleware',           () => ({ rateLimitMiddleware: () => (_q: any, _s: any, n: any) => n() }));

jest.mock('../src/lib/redis', () => ({
  redis: {
    set:  jest.fn().mockResolvedValue('OK'),
    get:  jest.fn().mockResolvedValue(null),
    del:  jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
  },
}));
jest.mock('../src/lib/email', () => ({
  sendOtpEmail:     jest.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/lib/refresh-tokens', () => ({
  REFRESH_TTL: 86400, issueRefreshToken: jest.fn().mockResolvedValue('r'), validateAndRotate: jest.fn(),
  revokeRefreshToken: jest.fn().mockResolvedValue(undefined), invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));

function buildApp() {
  const users = new StubUserRepository();
  const follows = new StubFollowRepository();
  const notifications = new StubNotificationRepository();
  const trophies = new StubTrophyRepository();
  const ctrl = new UserController(users);
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(ctrl, new StubHighlightRepository()));
  app.use('/users', createUsersRouter(ctrl, follows, notifications, new TrophyRecorder(trophies, notifications)));
  app.use(errorHandler);
  return { app, follows, notifications, trophies, users };
}

async function account(app: express.Express, email: string, username?: string): Promise<string> {
  const { body } = await request(app).post('/auth/register').send({ name: email[0].toUpperCase(), email, password: 'secret123', otp: '123456' });
  if (username) await request(app).put('/auth/profile').set('Authorization', `Bearer ${body.token}`).send({ username });
  return body.token;
}
const follow   = (app: express.Express, t: string, u: string) => request(app).post(`/users/${u}/follow`).set('Authorization', `Bearer ${t}`);
const unfollow = (app: express.Express, t: string, u: string) => request(app).delete(`/users/${u}/follow`).set('Authorization', `Bearer ${t}`);

describe('/users/:username/follow', () => {
  it('requires auth', async () => {
    const { app } = buildApp();
    expect((await request(app).post('/users/ana/follow')).status).toBe(401);
  });

  it('204 twice (idempotent), DELETE 204 twice', async () => {
    const { app, follows } = buildApp();
    await account(app, 'a@x.com', 'ana');
    const t = await account(app, 'b@x.com');
    expect((await follow(app, t, 'ana')).status).toBe(204);
    expect((await follow(app, t, 'ana')).status).toBe(204);
    expect(follows.pairs.size).toBe(1);
    expect((await unfollow(app, t, 'ana')).status).toBe(204);
    expect((await unfollow(app, t, 'ana')).status).toBe(204);
    expect(follows.pairs.size).toBe(0);
  });

  it('accepts mixed case in the URL', async () => {
    const { app } = buildApp();
    await account(app, 'a@x.com', 'ana');
    const t = await account(app, 'b@x.com');
    expect((await follow(app, t, 'ANA')).status).toBe(204);
  });

  it('404 for unknown or malformed username, 400 for self-follow', async () => {
    const { app } = buildApp();
    const t = await account(app, 'a@x.com', 'ana');
    expect((await follow(app, t, 'nobody')).status).toBe(404);
    expect((await follow(app, t, '..x')).status).toBe(404);
    expect((await follow(app, t, 'ana')).status).toBe(400);
  });

  it('notifies once per pair even across unfollow/re-follow; url empty when follower has no username', async () => {
    const { app, notifications, users } = buildApp();
    await account(app, 'a@x.com', 'ana');
    const t = await account(app, 'b@x.com');
    await follow(app, t, 'ana');
    await unfollow(app, t, 'ana');
    await follow(app, t, 'ana');
    const ana = await users.findByUsername('ana');
    const mine = (await notifications.listByUser(ana!.id)).filter(n => n.type === 'new_follower');
    expect(mine).toHaveLength(1);
    expect(mine[0].url).toBe('');
  });

  it('notification links to the follower profile when they have a username', async () => {
    const { app, notifications, users } = buildApp();
    await account(app, 'a@x.com', 'ana');
    const t = await account(app, 'b@x.com', 'beto');
    await follow(app, t, 'ana');
    const ana = await users.findByUsername('ana');
    const [n] = (await notifications.listByUser(ana!.id)).filter(x => x.type === 'new_follower');
    expect(n.url).toBe('/u/beto');
  });

  it('awards followers bronze to the followee once; re-follow does not recount; no X-New-Trophies header', async () => {
    const { app, trophies, users } = buildApp();
    await account(app, 'a@x.com', 'ana');
    const t = await account(app, 'b@x.com');
    const res = await follow(app, t, 'ana');
    expect(res.headers['x-new-trophies']).toBeUndefined();
    await unfollow(app, t, 'ana');
    await follow(app, t, 'ana');
    const ana = await users.findByUsername('ana');
    expect(await trophies.countEvents(ana!.id, 'followers')).toBe(1);
    expect(await trophies.listEarned(ana!.id)).toEqual([expect.objectContaining({ type: 'followers', tier: 'bronze' })]);
  });
});
