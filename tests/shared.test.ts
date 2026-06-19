import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubTripRepository, StubKarmaRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { TripController } from '../src/controllers/trip.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createTripsRouter } from '../src/routes/trips.routes';
import { errorHandler } from '../src/middleware/error.middleware';
import { respond } from '../src/middleware/respond.middleware';

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
  issueRefreshToken:      jest.fn().mockResolvedValue('mock-refresh-token'),
  validateAndRotate:      jest.fn(),
  revokeRefreshToken:     jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));

// Build an app optionally sharing a trip repo (to test karma in isolation).
function buildApp(karmaScore = 100, tripRepo = new StubTripRepository()) {
  const tripController = new TripController(tripRepo);
  const karmaController = new KarmaController(new StubKarmaRepository(karmaScore));

  const app = express();
  app.use(express.json());
  app.use('/auth',  createAuthRouter(new UserController(new StubUserRepository())));
  app.use('/trips', createTripsRouter(tripController, karmaController));
  app.get('/shared',          tripController.searchShared, respond(200));
  app.get('/shared/:shareId', tripController.findByShareId, respond(200));
  app.use(errorHandler);

  return { app, tripRepo };
}

async function getToken(app: express.Express): Promise<string> {
  const res = await request(app)
    .post('/auth/register')
    .send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

async function createAndShareTrip(app: express.Express, token: string, title = 'Europe 2026') {
  const createRes = await request(app)
    .post('/trips')
    .set('Authorization', `Bearer ${token}`)
    .send({ title, stops: [], transits: [] });
  const tripId = createRes.body.id as string;

  const shareRes = await request(app)
    .post(`/trips/${tripId}/share`)
    .set('Authorization', `Bearer ${token}`);

  return { tripId, shareId: shareRes.body.shareId as string };
}

// ─── GET /shared/:shareId ────────────────────────────────────────────────────

describe('GET /shared/:shareId', () => {
  it('returns 200 with SharedTripPayload including planId', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const { tripId, shareId } = await createAndShareTrip(app, token);

    const res = await request(app).get(`/shared/${shareId}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(shareId);
    expect(res.body.planId).toBe(tripId);
    expect(res.body.tripName).toBe('Europe 2026');
    expect(res.body.ownerEmail).toBeDefined();
    expect(Array.isArray(res.body.stops)).toBe(true);
    expect(Array.isArray(res.body.transits)).toBe(true);
  });

  it('returns 404 for unknown shareId', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/shared/nonexistent-id');
    expect(res.status).toBe(404);
  });
});

// ─── GET /shared?q= ──────────────────────────────────────────────────────────

describe('GET /shared?q=', () => {
  it('returns matching shared trips with planId', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const { tripId } = await createAndShareTrip(app, token, 'Europe 2026');

    const res = await request(app).get('/shared?q=Europe');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].tripName).toBe('Europe 2026');
    expect(res.body[0].planId).toBe(tripId);
  });

  it('returns empty array for blank query', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/shared?q=');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns empty array when q param is absent', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/shared');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns empty array when no trips match', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    await createAndShareTrip(app, token, 'Europe 2026');

    const res = await request(app).get('/shared?q=Japan');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('does not return unshared trips', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    await request(app)
      .post('/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Secret Trip', stops: [], transits: [] });

    const res = await request(app).get('/shared?q=Secret');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('handles long queries without error (caps at 100 chars server-side)', async () => {
    const { app } = buildApp();
    const res = await request(app).get(`/shared?q=${'a'.repeat(200)}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─── POST /trips/:id/share — karma enforcement ────────────────────────────────

describe('POST /trips/:id/share karma enforcement', () => {
  it('returns 200 and a shareId on first share when karma >= 1', async () => {
    const { app } = buildApp(100);
    const token = await getToken(app);
    const tripRes = await request(app)
      .post('/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Paris', stops: [], transits: [] });

    const shareRes = await request(app)
      .post(`/trips/${tripRes.body.id}/share`)
      .set('Authorization', `Bearer ${token}`);
    expect(shareRes.status).toBe(200);
    expect(shareRes.body.shareId).toBeDefined();
  });

  it('returns 402 on first share when karma < 1', async () => {
    // Share the same trip repo across two apps so:
    //   – richApp (karma=100) creates the trip
    //   – poorApp (karma=0) tries to share it → 402
    // Both use the same JWT secret so the token is valid across apps.
    const sharedRepo = new StubTripRepository();
    const { app: richApp } = buildApp(100, sharedRepo);
    const { app: poorApp } = buildApp(0, sharedRepo);

    const token = await getToken(richApp);
    const tripRes = await request(richApp)
      .post('/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Trip', stops: [], transits: [] });
    const tripId = tripRes.body.id as string;

    const shareRes = await request(poorApp)
      .post(`/trips/${tripId}/share`)
      .set('Authorization', `Bearer ${token}`);
    expect(shareRes.status).toBe(402);
    expect(shareRes.body.error).toMatch(/Insufficient karma/);
  });

  it('returns same shareId on re-share without karma check (idempotent)', async () => {
    const { app } = buildApp(100);
    const token = await getToken(app);
    const { tripId, shareId: firstShareId } = await createAndShareTrip(app, token);

    const reShareRes = await request(app)
      .post(`/trips/${tripId}/share`)
      .set('Authorization', `Bearer ${token}`);
    expect(reShareRes.status).toBe(200);
    expect(reShareRes.body.shareId).toBe(firstShareId);
  });
});
