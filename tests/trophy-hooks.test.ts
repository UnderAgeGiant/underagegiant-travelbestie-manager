import request from 'supertest';
import express from 'express';
import {
  StubUserRepository, StubTripRepository, StubKarmaRepository, StubFavoriteRepository,
  StubNotificationRepository, StubCollaboratorRepository, StubHighlightRepository, StubTrophyRepository,
} from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { TripController } from '../src/controllers/trip.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { CollaboratorController } from '../src/controllers/collaborator.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createTripsRouter } from '../src/routes/trips.routes';
import { createSharedRouter } from '../src/routes/shared.routes';
import { errorHandler } from '../src/middleware/error.middleware';
import { TrophyRecorder } from '../src/lib/trophy-recorder';

jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({ decryptPayloadMiddleware: (_q: any, _s: any, n: any) => n() }));
jest.mock('../src/middleware/auth/verify-otp.middleware',      () => ({ verifyOtpMiddleware:      (_q: any, _s: any, n: any) => n() }));
jest.mock('../src/middleware/rate-limit.middleware',           () => ({ rateLimitMiddleware: () => (_q: any, _s: any, n: any) => n() }));
jest.mock('../src/lib/refresh-tokens', () => ({
  REFRESH_TTL: 86400, issueRefreshToken: jest.fn().mockResolvedValue('r'), validateAndRotate: jest.fn(),
  revokeRefreshToken: jest.fn().mockResolvedValue(undefined), invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));

function buildApp() {
  const notificationRepo = new StubNotificationRepository();
  const trophyRepo = new StubTrophyRepository();
  const recorder = new TrophyRecorder(trophyRepo, notificationRepo);
  const users = new StubUserRepository();
  const trips = new StubTripRepository();
  const collaboratorRepo = new StubCollaboratorRepository(users, trips);
  const tripCtrl = new TripController(trips);
  const karmaCtrl = new KarmaController(new StubKarmaRepository());
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(users), new StubHighlightRepository()));
  app.use('/trips', createTripsRouter(
    tripCtrl, karmaCtrl, new CollaboratorController(collaboratorRepo), collaboratorRepo, users, trips, notificationRepo, recorder,
  ));
  app.use('/shared', createSharedRouter(tripCtrl, karmaCtrl, new StubFavoriteRepository(), notificationRepo, recorder));
  app.use(errorHandler);
  return { app, trophyRepo };
}

async function register(app: express.Express, email: string): Promise<{ token: string; userId: string }> {
  const res = await request(app).post('/auth/register').send({ name: email, email, password: 'secret123', otp: '123456' });
  const token = res.body.token as string;
  const userId = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).userId as string;
  return { token, userId };
}

async function publish(app: express.Express, token: string) {
  const created = await request(app).post('/trips').set('Authorization', `Bearer ${token}`)
    .send({ title: 'Roma', stops: [], transits: [] });
  const shared = await request(app).post(`/trips/${created.body.id}/share`).set('Authorization', `Bearer ${token}`);
  return { tripId: created.body.id as string, shareId: shared.body.shareId as string, publishRes: shared };
}

const earnedOf = (repo: StubTrophyRepository, userId: string) =>
  repo.earned.filter(e => e.userId === userId).map(e => `${e.type}:${e.tier}`);

describe('trophy hooks', () => {
  it('publishing awards publish_plan and returns X-New-Trophies', async () => {
    const { app, trophyRepo } = buildApp();
    const owner = await register(app, 'o@x.com');
    const { publishRes } = await publish(app, owner.token);
    expect(earnedOf(trophyRepo, owner.userId)).toContain('publish_plan:single');
    expect(JSON.parse(publishRes.headers['x-new-trophies'])[0]).toMatchObject({ type: 'publish_plan', tier: 'single' });
  });

  it('favorite toggling by the same fan counts once', async () => {
    const { app, trophyRepo } = buildApp();
    const owner = await register(app, 'o@x.com');
    const fan = await register(app, 'f@x.com');
    const { shareId } = await publish(app, owner.token);
    for (let i = 0; i < 3; i++) {
      await request(app).post(`/shared/${shareId}/favorite`).set('Authorization', `Bearer ${fan.token}`);
    }
    expect(trophyRepo.events.filter(e => e.type === 'favorites')).toHaveLength(1);
    expect(earnedOf(trophyRepo, owner.userId)).toContain('favorites:bronze');
  });

  it('self-favorite, self-clone and the owner viewing their own plan award nothing', async () => {
    const { app, trophyRepo } = buildApp();
    const owner = await register(app, 'o@x.com');
    const { shareId } = await publish(app, owner.token);
    await request(app).post(`/shared/${shareId}/favorite`).set('Authorization', `Bearer ${owner.token}`);
    await request(app).post(`/shared/${shareId}/clone`).set('Authorization', `Bearer ${owner.token}`);
    await request(app).get(`/shared/${shareId}`).set('Authorization', `Bearer ${owner.token}`);
    expect(earnedOf(trophyRepo, owner.userId)).toEqual(['publish_plan:single']);
  });

  it('a logged-in non-owner visit awards plan_visited to the owner; anonymous visits do not', async () => {
    const { app, trophyRepo } = buildApp();
    const owner = await register(app, 'o@x.com');
    const visitor = await register(app, 'v@x.com');
    const { shareId } = await publish(app, owner.token);
    await request(app).get(`/shared/${shareId}`);
    expect(earnedOf(trophyRepo, owner.userId)).not.toContain('plan_visited:single');
    const res = await request(app).get(`/shared/${shareId}`).set('Authorization', `Bearer ${visitor.token}`);
    expect(earnedOf(trophyRepo, owner.userId)).toContain('plan_visited:single');
    expect(res.headers['x-new-trophies']).toBeUndefined();   // visitor isn't the recipient
    expect(res.body.ownerId).toBeUndefined();                 // PII still stripped
  });

  it('a clone by another user awards clones to the owner', async () => {
    const { app, trophyRepo } = buildApp();
    const owner = await register(app, 'o@x.com');
    const other = await register(app, 'c@x.com');
    const { shareId } = await publish(app, owner.token);
    await request(app).post(`/shared/${shareId}/clone`).set('Authorization', `Bearer ${other.token}`);
    expect(earnedOf(trophyRepo, owner.userId)).toContain('clones:bronze');
  });
});

describe('trophy targets', () => {
  const { commentTarget, exportTarget } = require('../src/middleware/trophies/trophy-targets');
  const recorder = {} as TrophyRecorder;

  it('commentTarget: commenter ≠ owner → commenter, ref = comment id, celebrate', () => {
    const req = { user: { userId: 'u2' }, sharedTripMeta: { tripId: 't', ownerId: 'u1' }, result: { comment: { id: 'c9' } } } as any;
    expect(commentTarget(req, recorder)).toEqual({ userId: 'u2', refId: 'c9', celebrate: true });
  });

  it('commentTarget: owner commenting on own plan → null', () => {
    const req = { user: { userId: 'u1' }, sharedTripMeta: { tripId: 't', ownerId: 'u1' }, result: { comment: { id: 'c9' } } } as any;
    expect(commentTarget(req, recorder)).toBeNull();
  });

  it('exportTarget: owner, ref = trip id, celebrate', () => {
    const req = { user: { userId: 'u1' }, trip: { id: 't1' } } as any;
    expect(exportTarget(req, recorder)).toEqual({ userId: 'u1', refId: 't1', celebrate: true });
  });
});
