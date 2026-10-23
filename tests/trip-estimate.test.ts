import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubTripRepository, StubKarmaRepository, StubNotificationRepository, StubCollaboratorRepository, StubHighlightRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { TripController } from '../src/controllers/trip.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { CollaboratorController } from '../src/controllers/collaborator.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createTripsRouter } from '../src/routes/trips.routes';
import { errorHandler } from '../src/middleware/error.middleware';
import { resolvePrices } from '../src/lib/price-fetcher';
import { redis } from '../src/lib/redis';
import { IPriceEstimateRepository } from '../src/repositories/interfaces/price-estimate.repository';
import { CostSettings, TransitLeg, TripStop } from '../src/types';

jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({
  decryptPayloadMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/middleware/auth/verify-otp.middleware', () => ({
  verifyOtpMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/middleware/collaborators/send-collaborator-invite-email.middleware', () => ({
  sendCollaboratorInviteEmailMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// Real rateLimitMiddleware runs here; this fake Redis counts INCRs in memory (reset per test).
jest.mock('../src/lib/redis', () => {
  const counts = new Map<string, number>();
  return {
    redis: {
      incr: async (key: string) => { const n = (counts.get(key) ?? 0) + 1; counts.set(key, n); return n; },
      expire: async () => 1,
      get: async () => null,
      set: async () => 'OK',
      __reset: () => counts.clear(),
    },
  };
});

jest.mock('../src/lib/price-fetcher', () => ({ resolvePrices: jest.fn() }));

jest.mock('../src/lib/refresh-tokens', () => ({
  REFRESH_TTL:            86400,
  issueRefreshToken:      jest.fn().mockResolvedValue('mock-refresh-token'),
  validateAndRotate:      jest.fn(),
  revokeRefreshToken:     jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));

const resolvePricesMock = resolvePrices as jest.Mock;

const SETTINGS: CostSettings = { origin: null, adults: 2, children: 0, comfort: 'mid' };
const STOPS: TripStop[] = [{ cityId: 'paris', checkIn: '01/12/2026', checkOut: '03/12/2026', selectedAttractions: [] }];
const TRANSITS: TransitLeg[] = [];
const ROUTE_STOPS: TripStop[] = [
  { cityId: 'paris', checkIn: '01/12/2026', checkOut: '03/12/2026', selectedAttractions: [] },
  { cityId: 'rome', checkIn: '03/12/2026', checkOut: '05/12/2026', selectedAttractions: [] },
];
const ROUTE_TRANSITS: TransitLeg[] = [{
  fromCityId: 'paris', toCityId: 'rome', date: '03/12/2026',
  segments: [{ mode: 'flight', departureDate: '03/12/2026', departureTime: '10:00', arrivalDate: '03/12/2026', arrivalTime: '12:00' } as any],
}];

const priceRepo: IPriceEstimateRepository = { findFresh: async () => new Map(), upsertMany: async () => {} };

function buildApp({ withPriceRepo = true }: { withPriceRepo?: boolean } = {}) {
  const users = new StubUserRepository();
  const trips = new StubTripRepository();
  const karma = new StubKarmaRepository();
  const notifications = new StubNotificationRepository();
  const collaborators = new StubCollaboratorRepository(users, trips);

  const app = express();
  app.use(express.json());
  app.use('/auth',  createAuthRouter(new UserController(users), new StubHighlightRepository()));
  app.use('/trips', createTripsRouter(
    new TripController(trips),
    new KarmaController(karma),
    new CollaboratorController(collaborators),
    collaborators,
    users,
    trips,
    notifications,
    undefined,
    withPriceRepo ? priceRepo : undefined,
  ));
  app.use(errorHandler);
  return { app, users, trips, collaborators };
}

async function registerUser(app: express.Express, email: string): Promise<string> {
  const res = await request(app).post('/auth/register').send({ name: email, email, password: 'Password1!', otp: '123456' });
  return res.body.token as string;
}

function idFromToken(token: string): string {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).userId as string;
}

// Every price need resolves to 100 USD.
function priceEverything() {
  resolvePricesMock.mockImplementation(async (needs: { key: string }[]) =>
    new Map(needs.map(n => [n.key, 100] as [string, number])));
}

beforeEach(() => {
  (redis as unknown as { __reset: () => void }).__reset();
  resolvePricesMock.mockReset();
  priceEverything();
});

describe('POST /trips/:id/estimate', () => {
  async function ownerTrip(app: express.Express, trips: StubTripRepository, token: string, extra: Record<string, unknown> = {}) {
    return trips.create({
      title: 'Europa', stops: STOPS, transits: TRANSITS, ownerId: idFromToken(token),
      costSettings: SETTINGS, ...extra,
    });
  }

  it('owner gets 200 with a numeric total and an ISO calculatedAt, without stale', async () => {
    const { app, trips } = buildApp();
    const token = await registerUser(app, 'owner@test.com');
    const trip = await ownerTrip(app, trips, token);

    const res = await request(app).post(`/trips/${trip.id}/estimate`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.totalUsd).toBe('number');
    expect(new Date(res.body.calculatedAt).toISOString()).toBe(res.body.calculatedAt);
    expect(res.body).not.toHaveProperty('stale');
  });

  it('accepted collaborator gets 200', async () => {
    const { app, trips } = buildApp();
    const ownerToken = await registerUser(app, 'owner@test.com');
    const inviteeToken = await registerUser(app, 'invitee@test.com');
    const trip = await ownerTrip(app, trips, ownerToken);

    await request(app).post(`/trips/${trip.id}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`).send({ email: 'invitee@test.com' });
    await request(app).post(`/trips/${trip.id}/collaborators/accept`)
      .set('Authorization', `Bearer ${inviteeToken}`);

    const res = await request(app).post(`/trips/${trip.id}/estimate`).set('Authorization', `Bearer ${inviteeToken}`);
    expect(res.status).toBe(200);
  });

  it('stranger (neither owner nor collaborator) gets 403', async () => {
    const { app, trips } = buildApp();
    const ownerToken = await registerUser(app, 'owner@test.com');
    const strangerToken = await registerUser(app, 'stranger@test.com');
    const trip = await ownerTrip(app, trips, ownerToken);

    const res = await request(app).post(`/trips/${trip.id}/estimate`).set('Authorization', `Bearer ${strangerToken}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'No tienes acceso a este viaje' });
  });

  it('second call with no change returns the stored snapshot and does not call the fetcher', async () => {
    const { app, trips } = buildApp();
    const token = await registerUser(app, 'owner@test.com');
    const trip = await ownerTrip(app, trips, token);

    const first = await request(app).post(`/trips/${trip.id}/estimate`).set('Authorization', `Bearer ${token}`);
    resolvePricesMock.mockClear();
    const second = await request(app).post(`/trips/${trip.id}/estimate`).set('Authorization', `Bearer ${token}`);

    expect(second.status).toBe(200);
    expect(second.body.calculatedAt).toBe(first.body.calculatedAt);
    expect(resolvePricesMock).not.toHaveBeenCalled();
  });

  it('recomputes after adults changes', async () => {
    const { app, trips } = buildApp();
    const token = await registerUser(app, 'owner@test.com');
    const trip = await ownerTrip(app, trips, token);

    await request(app).post(`/trips/${trip.id}/estimate`).set('Authorization', `Bearer ${token}`);
    await trips.update(trip.id, { costSettings: { ...SETTINGS, adults: 4 } });
    resolvePricesMock.mockClear();

    const res = await request(app).post(`/trips/${trip.id}/estimate`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.settings.adults).toBe(4);
    expect(resolvePricesMock).toHaveBeenCalled();
  });

  it('recomputes when the stored snapshot has unestimated legs, even with a matching hash', async () => {
    const { app, trips } = buildApp();
    const token = await registerUser(app, 'owner@test.com');
    const trip = await ownerTrip(app, trips, token, { stops: ROUTE_STOPS, transits: ROUTE_TRANSITS });

    await request(app).post(`/trips/${trip.id}/estimate`).set('Authorization', `Bearer ${token}`);
    const stored = (await trips.findById(trip.id))!.costEstimate!;
    await trips.saveEstimate(trip.id, { ...stored, unestimated: [{ from: 'paris', to: 'rome', mode: 'flight' }] });
    resolvePricesMock.mockClear();

    const res = await request(app).post(`/trips/${trip.id}/estimate`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(resolvePricesMock).toHaveBeenCalled();
  });

  it('DeepSeek failure still answers 200, with the unpriced routes in unestimated', async () => {
    resolvePricesMock.mockResolvedValue(new Map());
    const { app, trips } = buildApp();
    const token = await registerUser(app, 'owner@test.com');
    const trip = await ownerTrip(app, trips, token, { stops: ROUTE_STOPS, transits: ROUTE_TRANSITS });
    const saveSpy = jest.spyOn(trips, 'saveEstimate');

    const res = await request(app).post(`/trips/${trip.id}/estimate`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.unestimated.length).toBeGreaterThan(0);
    expect(saveSpy).toHaveBeenCalledWith(trip.id, expect.objectContaining({ totalUsd: expect.any(Number) }));
  });

  it('21st call within the hour gets 429', async () => {
    const { app, trips } = buildApp();
    const token = await registerUser(app, 'owner@test.com');
    const trip = await ownerTrip(app, trips, token);

    for (let i = 0; i < 20; i++) {
      const ok = await request(app).post(`/trips/${trip.id}/estimate`).set('Authorization', `Bearer ${token}`);
      expect(ok.status).toBe(200);
    }
    const limited = await request(app).post(`/trips/${trip.id}/estimate`).set('Authorization', `Bearer ${token}`);
    expect(limited.status).toBe(429);
  });
});

describe('POST /trips/:id/estimate — wiring and lookup', () => {
  it('without a wired price repo the route fails loudly (500) and never calls the fetcher', async () => {
    const { app, trips } = buildApp({ withPriceRepo: false });
    const token = await registerUser(app, 'owner@test.com');
    const trip = await trips.create({ title: 'Europa', stops: STOPS, transits: TRANSITS, ownerId: idFromToken(token), costSettings: SETTINGS });

    const res = await request(app).post(`/trips/${trip.id}/estimate`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(resolvePricesMock).not.toHaveBeenCalled();
  });

  it('a non-existent trip id returns 404', async () => {
    const { app } = buildApp();
    const token = await registerUser(app, 'owner@test.com');

    const res = await request(app).post('/trips/00000000-0000-4000-8000-000000000000/estimate').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(resolvePricesMock).not.toHaveBeenCalled();
  });
});
