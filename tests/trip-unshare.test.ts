import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubTripRepository, StubKarmaRepository, StubNotificationRepository, StubCollaboratorRepository, StubHighlightRepository, StubFavoriteRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { TripController } from '../src/controllers/trip.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { CollaboratorController } from '../src/controllers/collaborator.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createTripsRouter } from '../src/routes/trips.routes';
import { createSharedRouter } from '../src/routes/shared.routes';
import { errorHandler } from '../src/middleware/error.middleware';
import { redis } from '../src/lib/redis';
import { seoSharedCacheKey, seoCityPlansCacheKey, SEO_SITEMAP_CACHE_KEY } from '../src/lib/seo';
import { feedFirstPageCacheKey } from '../src/controllers/trip.controller';

jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({
  decryptPayloadMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/middleware/auth/verify-otp.middleware', () => ({
  verifyOtpMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/middleware/rate-limit.middleware', () => ({
  rateLimitMiddleware: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/lib/redis', () => ({
  redis: {
    set:  jest.fn().mockResolvedValue('OK'),
    get:  jest.fn().mockResolvedValue(null),
    del:  jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('../src/lib/refresh-tokens', () => ({
  REFRESH_TTL:            86400,
  issueRefreshToken:      jest.fn().mockResolvedValue('mock-refresh-token'),
  validateAndRotate:      jest.fn(),
  revokeRefreshToken:     jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));

// ── DELETE /trips/:id/share (contract §2.6b) ────────────────────────────────
function buildApp() {
  const users = new StubUserRepository();
  const trips = new StubTripRepository();
  const collaborators = new StubCollaboratorRepository(users, trips);
  const tripController = new TripController(trips);
  const notifications = new StubNotificationRepository();
  const karmaController = new KarmaController(new StubKarmaRepository());

  const app = express();
  app.use(express.json());
  app.use('/auth',   createAuthRouter(new UserController(users), new StubHighlightRepository()));
  app.use('/trips',  createTripsRouter(
    tripController, karmaController, new CollaboratorController(collaborators), collaborators, users, trips, notifications,
  ));
  app.use('/shared', createSharedRouter(tripController, karmaController, new StubFavoriteRepository(), notifications));
  app.use(errorHandler);
  return { app, users, trips, collaborators };
}

async function register(app: express.Express, email: string): Promise<string> {
  const res = await request(app).post('/auth/register').send({ name: 'User', email, password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

async function setup() {
  const ctx = buildApp();
  const ownerToken = await register(ctx.app, 'owner@test.com');
  const ownerId = (await ctx.users.findByEmail('owner@test.com'))!.id;
  const stop = (cityId: string) => ({ cityId, checkIn: '01/12/2026', checkOut: '03/12/2026', selectedAttractions: [] });
  const trip = await ctx.trips.create({ title: 'Plan', stops: [stop('paris'), stop('rome'), stop('paris')], transits: [], ownerId });
  return { ...ctx, ownerToken, trip };
}

beforeEach(() => jest.clearAllMocks());

describe('DELETE /trips/:id/share', () => {
  it('owner: 204, clears the share, evicts every public cache listing it, and GET /shared/:oldId is 404', async () => {
    const { app, trips, ownerToken, trip } = await setup();
    await trips.setShareId(trip.id, 'old-share');
    const spy = jest.spyOn(trips, 'clearShare');

    const res = await request(app).delete(`/trips/${trip.id}/share`).set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(204);
    expect(spy).toHaveBeenCalledWith(trip.id);
    expect((await trips.findById(trip.id))!.shareId).toBeFalsy();
    expect(redis.del).toHaveBeenCalledTimes(1);
    expect(redis.del).toHaveBeenCalledWith(
      seoSharedCacheKey('old-share'), feedFirstPageCacheKey(), SEO_SITEMAP_CACHE_KEY,
      seoCityPlansCacheKey('paris'), seoCityPlansCacheKey('rome'),
    );
    expect((await request(app).get('/shared/old-share')).status).toBe(404);
  });

  it('already unpublished: 204 (idempotent), no cache touched', async () => {
    const { app, ownerToken, trip } = await setup();
    const res = await request(app).delete(`/trips/${trip.id}/share`).set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(204);
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('a Redis failure on the cache eviction does not fail the unpublish', async () => {
    const { app, trips, ownerToken, trip } = await setup();
    await trips.setShareId(trip.id, 'old-share');
    (redis.del as jest.Mock).mockRejectedValueOnce(new Error('redis down'));
    const res = await request(app).delete(`/trips/${trip.id}/share`).set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(204);
    expect((await trips.findById(trip.id))!.shareId).toBeFalsy();
  });

  it('accepted collaborator: 404 and the share stays', async () => {
    const { app, users, trips, collaborators, trip } = await setup();
    await trips.setShareId(trip.id, 'old-share');
    const collabToken = await register(app, 'collab@test.com');
    const collabId = (await users.findByEmail('collab@test.com'))!.id;
    await collaborators.invite(trip.id, collabId);
    await collaborators.accept(trip.id, collabId);
    const spy = jest.spyOn(trips, 'clearShare');

    const res = await request(app).delete(`/trips/${trip.id}/share`).set('Authorization', `Bearer ${collabToken}`);

    expect(res.status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
    expect((await trips.findById(trip.id))!.shareId).toBe('old-share');
  });

  it('stranger: 404', async () => {
    const { app, trip } = await setup();
    const strangerToken = await register(app, 'stranger@test.com');
    const res = await request(app).delete(`/trips/${trip.id}/share`).set('Authorization', `Bearer ${strangerToken}`);
    expect(res.status).toBe(404);
  });

  it('unknown trip: 404', async () => {
    const { app, ownerToken } = await setup();
    const res = await request(app).delete('/trips/00000000-0000-0000-0000-000000000000/share').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  it('no JWT: 401', async () => {
    const { app, trip } = await setup();
    const res = await request(app).delete(`/trips/${trip.id}/share`);
    expect(res.status).toBe(401);
  });

  it('re-sharing after unshare issues a NEW shareId', async () => {
    const { app, ownerToken, trip } = await setup();
    const first = await request(app).post(`/trips/${trip.id}/share`).set('Authorization', `Bearer ${ownerToken}`);
    await request(app).delete(`/trips/${trip.id}/share`).set('Authorization', `Bearer ${ownerToken}`);
    const second = await request(app).post(`/trips/${trip.id}/share`).set('Authorization', `Bearer ${ownerToken}`);

    expect(second.status).toBe(200);
    expect(second.body.shareId).toBeTruthy();
    expect(second.body.shareId).not.toBe(first.body.shareId);
  });
});
