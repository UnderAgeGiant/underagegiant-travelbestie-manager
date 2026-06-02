import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubTripRepository, StubKarmaRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { TripController } from '../src/controllers/trip.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createTripsRouter } from '../src/routes/trips.routes';
import { createSharedRouter } from '../src/routes/shared.routes';
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

function buildApp() {
  const karmaRepo = new StubKarmaRepository(100);
  const tripCtrl  = new TripController(new StubTripRepository());
  const karmaCtrl = new KarmaController(karmaRepo);
  const app = express();
  app.use(express.json());
  app.use('/auth',   createAuthRouter(new UserController(new StubUserRepository())));
  app.use('/trips',  createTripsRouter(tripCtrl, karmaCtrl));
  app.use('/shared', createSharedRouter(tripCtrl, karmaCtrl));
  app.use(errorHandler);
  return { app, karmaRepo };
}

async function getToken(app: express.Express): Promise<string> {
  const res = await request(app)
    .post('/auth/register')
    .send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

async function createAndShareTrip(app: express.Express, token: string) {
  const created = await request(app)
    .post('/trips')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Roma en 5 días', stops: [], transits: [] });
  const shared = await request(app)
    .post(`/trips/${created.body.id}/share`)
    .set('Authorization', `Bearer ${token}`);
  return { trip: created.body, shareId: shared.body.shareId as string };
}

// ─── Shared clone ────────────────────────────────────────────────────────────

describe('POST /shared/:shareId/clone', () => {
  it('1. valid shareId, karma ≥ 1 → 201, title prefixed, stops/transits match', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const stops = [{ cityId: 'rome', checkIn: '01/07/2026', checkOut: '05/07/2026', selectedAttractions: [] }];
    const transits = [{ fromCityId: 'london', toCityId: 'rome', segments: [] }];
    const created = await request(app)
      .post('/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Roma en 5 días', stops, transits });
    const shared = await request(app)
      .post(`/trips/${created.body.id}/share`)
      .set('Authorization', `Bearer ${token}`);
    const shareId = shared.body.shareId as string;

    const res = await request(app)
      .post(`/shared/${shareId}/clone`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Copia de Roma en 5 días');
    expect(res.body.stops).toHaveLength(1);
    expect(res.body.transits).toHaveLength(1);
    expect(res.body.id).toBeDefined();
    expect(res.body.id).not.toBe(created.body.id);
  });

  it('2. shareId not found → 404', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post('/shared/nonexistent-share/clone')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('3. valid shareId, karma = 0 → 402', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);
    const { shareId } = await createAndShareTrip(app, token);
    karmaRepo.setScore(0);

    const res = await request(app)
      .post(`/shared/${shareId}/clone`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(402);
  });

  it('4. no Authorization header → 401', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const { shareId } = await createAndShareTrip(app, token);

    const res = await request(app).post(`/shared/${shareId}/clone`);
    expect(res.status).toBe(401);
  });
});

// ─── Owned clone ─────────────────────────────────────────────────────────────

describe('POST /trips/:id/clone', () => {
  it('5. owner clones own trip, karma ≥ 1 → 201, title prefixed, new id', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const created = await request(app)
      .post('/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Tokio 2026', stops: [], transits: [] });

    const res = await request(app)
      .post(`/trips/${created.body.id}/clone`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Copia de Tokio 2026');
    expect(res.body.id).toBeDefined();
    expect(res.body.id).not.toBe(created.body.id);
  });

  it('6. trip not found → 404', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .post('/trips/nonexistent-id/clone')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('7. authenticated but not the owner → 404', async () => {
    const { app } = buildApp();

    const ownerRes = await request(app)
      .post('/auth/register')
      .send({ name: 'Owner', email: 'owner@test.com', password: 'secret123', otp: '123456' });
    const ownerToken = ownerRes.body.token as string;
    const created = await request(app)
      .post('/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Owner trip', stops: [], transits: [] });

    const otherRes = await request(app)
      .post('/auth/register')
      .send({ name: 'Other', email: 'other@test.com', password: 'secret123', otp: '123456' });
    const otherToken = otherRes.body.token as string;

    const res = await request(app)
      .post(`/trips/${created.body.id}/clone`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });

  it('8. no Authorization header → 401', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const created = await request(app)
      .post('/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Some trip', stops: [], transits: [] });

    const res = await request(app).post(`/trips/${created.body.id}/clone`);
    expect(res.status).toBe(401);
  });

  it('9. owner clones, karma = 0 → 402', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);
    const created = await request(app)
      .post('/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Cheap trip', stops: [], transits: [] });
    karmaRepo.setScore(0);

    const res = await request(app)
      .post(`/trips/${created.body.id}/clone`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(402);
  });

  it('10. cloned trip has no shareId in response', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const created = await request(app)
      .post('/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Private trip', stops: [], transits: [] });

    const res = await request(app)
      .post(`/trips/${created.body.id}/clone`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('shareId');
  });
});
