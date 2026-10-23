import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubHighlightRepository, StubFollowRepository, StubTripRepository, StubTrophyRepository, StubKarmaRepository, StubNotificationRepository, StubCollaboratorRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { TripController } from '../src/controllers/trip.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { CollaboratorController } from '../src/controllers/collaborator.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createTripsRouter } from '../src/routes/trips.routes';
import { createUsersRouter } from '../src/routes/users.routes';
import { createPublicProfileRouter } from '../src/routes/public-profile.routes';
import { errorHandler } from '../src/middleware/error.middleware';

jest.mock('../src/lib/deepseek', () => ({ deepseekClient: {} }));

jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({ decryptPayloadMiddleware: (_q: any, _s: any, n: any) => n() }));
jest.mock('../src/middleware/auth/verify-otp.middleware',      () => ({ verifyOtpMiddleware:      (_q: any, _s: any, n: any) => n() }));
jest.mock('../src/middleware/rate-limit.middleware',           () => ({ rateLimitMiddleware: () => (_q: any, _s: any, n: any) => n() }));
jest.mock('../src/lib/refresh-tokens', () => ({
  REFRESH_TTL: 86400, issueRefreshToken: jest.fn().mockResolvedValue('r'), validateAndRotate: jest.fn(),
  revokeRefreshToken: jest.fn().mockResolvedValue(undefined), invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/lib/redis', () => ({
  redis: {
    set:  jest.fn().mockResolvedValue('OK'),
    get:  jest.fn().mockResolvedValue(null),
    del:  jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
  },
}));
jest.mock('../src/lib/email', () => ({
  sendOtpEmail:               jest.fn().mockResolvedValue(undefined),
  sendWelcomeEmail:           jest.fn().mockResolvedValue(undefined),
  sendKarmaConfirmationEmail: jest.fn().mockResolvedValue(undefined),
}));

function buildApp() {
  const users = new StubUserRepository();
  const trips = new StubTripRepository();
  const follows = new StubFollowRepository();
  const notifications = new StubNotificationRepository();
  const trophies = new StubTrophyRepository();
  const userCtrl = new UserController(users);
  const collab = new StubCollaboratorRepository(users, trips);
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(userCtrl, new StubHighlightRepository()));
  app.use('/trips', createTripsRouter(new TripController(trips), new KarmaController(new StubKarmaRepository()),
    new CollaboratorController(collab), collab, users, trips, notifications));
  app.use('/users', createUsersRouter(userCtrl, follows, notifications));
  app.use('/u', createPublicProfileRouter(userCtrl, trips, follows, trophies));
  app.use(errorHandler);
  return { app, users, trophies };
}

async function account(app: express.Express, email: string, username?: string): Promise<string> {
  const { body } = await request(app).post('/auth/register').send({ name: 'Ana', email, password: 'secret123', otp: '123456' });
  if (username) await request(app).put('/auth/profile').set('Authorization', `Bearer ${body.token}`).send({ username });
  return body.token;
}

describe('GET /u/:username', () => {
  it('returns the public profile without PII', async () => {
    const { app, users, trophies } = buildApp();
    const t = await account(app, 'ana@x.com', 'ana');
    const ana = await users.findByUsername('ana');
    await trophies.awardTiers(ana!.id, 'favorites', ['bronze']);
    await trophies.addEvent(ana!.id, 'favorites', 'trip-1', 'trip-1:fan-1');
    const trip = await request(app).post('/trips').set('Authorization', `Bearer ${t}`)
      .send({ title: 'Lima', stops: [{ cityId: 'lima', checkIn: '01/11/2026', checkOut: '03/11/2026', selectedAttractions: [] }], transits: [] });
    await request(app).post(`/trips/${trip.body.id}/share`).set('Authorization', `Bearer ${t}`);

    const res = await request(app).get('/u/Ana');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: 'ana', name: 'Ana', followerCount: 0, followingCount: 0, visitedCityIds: ['lima'] });
    expect(res.body.trophies).toHaveLength(1);
    expect(res.body.trips).toHaveLength(1);
    expect(res.body).not.toHaveProperty('isFollowedByMe');
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('ana@x.com');
    expect(raw).not.toMatch(/"(ownerId|ownerEmail|userId|email|progress)"/);
  });

  it('isFollowedByMe only for a logged-in non-owner viewer', async () => {
    const { app } = buildApp();
    await account(app, 'ana@x.com', 'ana');
    const t2 = await account(app, 'b@x.com');
    expect((await request(app).get('/u/ana').set('Authorization', `Bearer ${t2}`)).body.isFollowedByMe).toBe(false);
    await request(app).post('/users/ana/follow').set('Authorization', `Bearer ${t2}`);
    const res = await request(app).get('/u/ana').set('Authorization', `Bearer ${t2}`);
    expect(res.body).toMatchObject({ isFollowedByMe: true, followerCount: 1 });
  });

  it('404 unknown and malformed usernames', async () => {
    const { app } = buildApp();
    expect((await request(app).get('/u/nobody')).status).toBe(404);
    expect((await request(app).get('/u/..')).status).toBe(404);
    expect((await request(app).get('/u/%27%3Bdrop')).status).toBe(404);
  });
});
