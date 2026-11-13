jest.mock('../src/lib/analytics', () => ({ capture: jest.fn(), alias: jest.fn() }));
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
  REFRESH_TTL: 86400,
  issueRefreshToken: jest.fn().mockResolvedValue('mock-refresh-token'),
  validateAndRotate: jest.fn(),
  revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import express from 'express';
import { capture } from '../src/lib/analytics';
import {
  StubUserRepository, StubTripRepository, StubKarmaRepository, StubFavoriteRepository,
  StubNotificationRepository, StubCollaboratorRepository, StubHighlightRepository,
} from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { TripController } from '../src/controllers/trip.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { CollaboratorController } from '../src/controllers/collaborator.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createTripsRouter } from '../src/routes/trips.routes';
import { createSharedRouter } from '../src/routes/shared.routes';
import { errorHandler } from '../src/middleware/error.middleware';

beforeEach(() => { jest.spyOn(process.stdout, 'write').mockImplementation(() => true); (capture as jest.Mock).mockClear(); });
afterEach(() => jest.restoreAllMocks());

function buildApp(balance = 0) {
  const karmaRepo = new StubKarmaRepository(balance);
  const users = new StubUserRepository();
  const trips = new StubTripRepository();
  const collaborators = new StubCollaboratorRepository(users, trips);
  const tripCtrl = new TripController(trips);
  const karmaCtrl = new KarmaController(karmaRepo);
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(users), new StubHighlightRepository()));
  app.use('/trips', createTripsRouter(
    tripCtrl, karmaCtrl, new CollaboratorController(collaborators), collaborators, users, trips, new StubNotificationRepository(),
  ));
  app.use('/shared', createSharedRouter(tripCtrl, karmaCtrl, new StubFavoriteRepository(), new StubNotificationRepository(), undefined, users));
  app.use(errorHandler);
  return { app, karmaRepo, users, trips };
}

async function register(app: express.Express, email = 'ana@test.com'): Promise<{ token: string; userId: string }> {
  const res = await request(app).post('/auth/register').send({ name: 'Ana', email, password: 'secret123', otp: '123456' });
  const b64 = res.body.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return { token: res.body.token, userId: JSON.parse(Buffer.from(b64, 'base64').toString()).userId };
}

const body = { title: 'Mi primer viaje', stops: [], transits: [] };

describe('free first plan — POST /trips', () => {
  it('with the gift available → 201, no karma event, firstPlanUsedAt set, cta_first_plan_saved manual', async () => {
    const { app, karmaRepo, users } = buildApp(0);
    const { token, userId } = await register(app);
    const res = await request(app).post('/trips').set('Authorization', `Bearer ${token}`).send(body);
    expect(res.status).toBe(201);
    expect(karmaRepo.events).toHaveLength(0);
    expect((await users.findById(userId))!.firstPlanUsedAt).not.toBeNull();
    expect(capture).toHaveBeenCalledWith(userId, 'cta_first_plan_saved', { path: 'manual', tripId: res.body.id });
  });

  it('second time → 402 (gift used, balance 0)', async () => {
    const { app } = buildApp(0);
    const { token } = await register(app);
    await request(app).post('/trips').set('Authorization', `Bearer ${token}`).send(body);
    const res = await request(app).post('/trips').set('Authorization', `Bearer ${token}`).send(body);
    expect(res.status).toBe(402);
  });

  it('pays when the claim fails (gift already held elsewhere)', async () => {
    const { app, karmaRepo, users } = buildApp(100);
    const { token, userId } = await register(app);
    await users.claimFirstPlan(userId);   // e.g. a first-run AI job in another tab
    const res = await request(app).post('/trips').set('Authorization', `Bearer ${token}`).send(body);
    expect(res.status).toBe(201);
    expect(karmaRepo.events.filter(e => e.reason === 'trip_created')).toHaveLength(1);
    expect(capture).not.toHaveBeenCalledWith(userId, 'cta_first_plan_saved', expect.anything());
  });

  it('path is ai when sourceAiPlanRequestId is present', async () => {
    const { app } = buildApp(0);
    const { token, userId } = await register(app);
    const res = await request(app).post('/trips').set('Authorization', `Bearer ${token}`)
      .send({ ...body, sourceAiPlanRequestId: '11111111-1111-4111-8111-111111111111' });
    expect(res.status).toBe(201);
    expect(capture).toHaveBeenCalledWith(userId, 'cta_first_plan_saved', { path: 'ai', tripId: res.body.id });
  });

  it('a failing INSERT after the claim releases the gift', async () => {
    const { app, users, trips } = buildApp(0);
    const { token, userId } = await register(app);
    jest.spyOn(trips, 'create').mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).post('/trips').set('Authorization', `Bearer ${token}`).send(body);
    expect(res.status).toBe(500);
    expect((await users.findById(userId))!.firstPlanUsedAt).toBeNull();
    expect(await users.claimFirstPlan(userId)).toBe(true);
  });
});

describe('free first plan — POST /shared/:shareId/clone', () => {
  async function sharedTrip(app: express.Express) {
    const owner = await register(app, 'owner@test.com');   // the owner's first trip is their own gift
    const created = await request(app).post('/trips').set('Authorization', `Bearer ${owner.token}`).send({ title: 'Roma', stops: [], transits: [] });
    const shared = await request(app).post(`/trips/${created.body.id}/share`).set('Authorization', `Bearer ${owner.token}`);
    return shared.body.shareId as string;
  }

  it('?source=featured with the gift → 201, no charge, cta_first_plan_saved featured_copy', async () => {
    const { app, karmaRepo } = buildApp(0);
    const shareId = await sharedTrip(app);
    const eventsBefore = karmaRepo.events.length;
    const { token, userId } = await register(app);
    const res = await request(app).post(`/shared/${shareId}/clone?source=featured`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(karmaRepo.events).toHaveLength(eventsBefore);
    expect(capture).toHaveBeenCalledWith(userId, 'cta_first_plan_saved', { path: 'featured_copy', tripId: res.body.id });
  });

  it('no source → shared_copy; a second clone without karma → 402', async () => {
    const { app } = buildApp(0);
    const shareId = await sharedTrip(app);
    const { token, userId } = await register(app);
    const res = await request(app).post(`/shared/${shareId}/clone`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(capture).toHaveBeenCalledWith(userId, 'cta_first_plan_saved', { path: 'shared_copy', tripId: res.body.id });
    const again = await request(app).post(`/shared/${shareId}/clone`).set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(402);
  });
});
