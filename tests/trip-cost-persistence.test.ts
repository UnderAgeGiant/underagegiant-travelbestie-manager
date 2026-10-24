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
import { estimateInputsHash } from '../src/lib/trip-cost';
import { CostEstimate, CostSettings, Place, Trip, TripStop, TransitLeg } from '../src/types';

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

// ── Fixtures ───────────────────────────────────────────────────────────────
const SCL: Place = { geonameId: 3871336, name: 'Santiago', countryCode: 'CL', iata: 'SCL' };
const SETTINGS: CostSettings = { origin: SCL, adults: 2, children: 1, infants: 1, comfort: 'budget' };
const STOPS: TripStop[] = [{ cityId: 'paris', checkIn: '01/12/2026', checkOut: '03/12/2026', selectedAttractions: [] }];
const TRANSITS: TransitLeg[] = [];

// A snapshot whose hash matches the trip's inputs (fresh) or deliberately does not (stale).
function estimateFor(stops: TripStop[], transits: TransitLeg[], settings: CostSettings, fresh: boolean): CostEstimate {
  return {
    totalUsd: 500, flightsUsd: 0, lodgingUsd: 300, ticketsUsd: 0, groundUsd: 200,
    nights: 2, rooms: 1, ticketCount: 0, unpricedTicketCount: 0, unestimated: [],
    missingOrigin: false, settings,
    inputsHash: fresh ? estimateInputsHash({ stops, transits } as Trip, settings) : 'stale-hash',
    calculatedAt: new Date().toISOString(),
  };
}

function buildApp() {
  const users = new StubUserRepository();
  const trips = new StubTripRepository();
  const collaborators = new StubCollaboratorRepository(users, trips);
  const karmaController = new KarmaController(new StubKarmaRepository());
  const tripController = new TripController(trips);
  const notifications = new StubNotificationRepository();

  const app = express();
  app.use(express.json());
  app.use('/auth',   createAuthRouter(new UserController(users), new StubHighlightRepository()));
  app.use('/trips',  createTripsRouter(
    tripController, karmaController, new CollaboratorController(collaborators), collaborators, users, trips, notifications,
  ));
  app.use('/shared', createSharedRouter(tripController, karmaController, new StubFavoriteRepository(), notifications));
  app.use(errorHandler);
  return { app, users, trips };
}

async function register(app: express.Express): Promise<string> {
  const res = await request(app).post('/auth/register').send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

// ── POST /trips ────────────────────────────────────────────────────────────
describe('POST /trips — cost settings', () => {
  it('without costSettings the repo create receives no settings (DB defaults apply)', async () => {
    const { app, trips } = buildApp();
    const token = await register(app);
    const spy = jest.spyOn(trips, 'create');

    const res = await request(app).post('/trips').set('Authorization', `Bearer ${token}`)
      .send({ title: 'Plan', stops: STOPS, transits: TRANSITS });

    expect(res.status).toBe(201);
    expect(spy.mock.calls[0][0]).not.toHaveProperty('costSettings');
    expect(res.body.costSettings).toEqual({ origin: null, adults: 1, children: 0, infants: 0, comfort: 'mid' });
    expect(res.body.costEstimate).toBeNull();
  });

  it('passes a sent costSettings through to the repo create', async () => {
    const { app, trips } = buildApp();
    const token = await register(app);
    const spy = jest.spyOn(trips, 'create');

    const res = await request(app).post('/trips').set('Authorization', `Bearer ${token}`)
      .send({ title: 'Plan', stops: STOPS, transits: TRANSITS, costSettings: SETTINGS });

    expect(res.status).toBe(201);
    expect(spy.mock.calls[0][0]).toMatchObject({ costSettings: SETTINGS });
    expect(res.body.costSettings).toEqual(SETTINGS);
  });

  it('rejects a client-supplied cost snapshot', async () => {
    const { app } = buildApp();
    const token = await register(app);
    const res = await request(app).post('/trips').set('Authorization', `Bearer ${token}`)
      .send({ title: 'Plan', stops: STOPS, transits: TRANSITS, costEstimate: estimateFor(STOPS, TRANSITS, SETTINGS, true) });
    expect(res.status).toBe(400);
  });
});

// ── PUT /trips/:id ─────────────────────────────────────────────────────────
describe('PUT /trips/:id — cost settings', () => {
  it('without costSettings the repo update receives no costSettings key and the stored settings stay', async () => {
    const { app, users, trips } = buildApp();
    const token = await register(app);
    const ownerId = (await users.findByEmail('ana@test.com'))!.id;
    const trip = await trips.create({ title: 'Plan', stops: STOPS, transits: TRANSITS, ownerId, costSettings: SETTINGS });
    const spy = jest.spyOn(trips, 'update');

    const res = await request(app).put(`/trips/${trip.id}`).set('Authorization', `Bearer ${token}`)
      .send({ title: 'Renamed' });

    expect(res.status).toBe(200);
    expect(spy.mock.calls[0][1]).not.toHaveProperty('costSettings');
    expect((await trips.findById(trip.id))!.costSettings).toEqual(SETTINGS);
  });

  it('writes a sent costSettings and returns it', async () => {
    const { app, users, trips } = buildApp();
    const token = await register(app);
    const ownerId = (await users.findByEmail('ana@test.com'))!.id;
    const trip = await trips.create({ title: 'Plan', stops: STOPS, transits: TRANSITS, ownerId });

    const res = await request(app).put(`/trips/${trip.id}`).set('Authorization', `Bearer ${token}`)
      .send({ title: 'Plan', costSettings: SETTINGS });

    expect(res.status).toBe(200);
    expect(res.body.costSettings).toEqual(SETTINGS);
  });

  it('rejects adults: 0 with 400', async () => {
    const { app, users, trips } = buildApp();
    const token = await register(app);
    const ownerId = (await users.findByEmail('ana@test.com'))!.id;
    const trip = await trips.create({ title: 'Plan', stops: STOPS, transits: TRANSITS, ownerId });

    const res = await request(app).put(`/trips/${trip.id}`).set('Authorization', `Bearer ${token}`)
      .send({ costSettings: { ...SETTINGS, adults: 0 } });

    expect(res.status).toBe(400);
  });

  it('costSettings without infants (old client) → 200 and the repo receives infants: 0', async () => {
    const { app, users, trips } = buildApp();
    const token = await register(app);
    const ownerId = (await users.findByEmail('ana@test.com'))!.id;
    const trip = await trips.create({ title: 'Plan', stops: STOPS, transits: TRANSITS, ownerId });
    const spy = jest.spyOn(trips, 'update');
    const { infants: _omit, ...legacy } = SETTINGS;

    const res = await request(app).put(`/trips/${trip.id}`).set('Authorization', `Bearer ${token}`)
      .send({ costSettings: legacy });

    expect(res.status).toBe(200);
    expect(spy.mock.calls[0][1].costSettings).toEqual({ ...SETTINGS, infants: 0 });
  });

  it.each([21, -1, 1.5])('rejects infants: %p with 400', async infants => {
    const { app, users, trips } = buildApp();
    const token = await register(app);
    const ownerId = (await users.findByEmail('ana@test.com'))!.id;
    const trip = await trips.create({ title: 'Plan', stops: STOPS, transits: TRANSITS, ownerId });

    const res = await request(app).put(`/trips/${trip.id}`).set('Authorization', `Bearer ${token}`)
      .send({ costSettings: { ...SETTINGS, infants } });

    expect(res.status).toBe(400);
  });

  it('flags a stale snapshot on the response but never stores the flag', async () => {
    const { app, users, trips } = buildApp();
    const token = await register(app);
    const ownerId = (await users.findByEmail('ana@test.com'))!.id;
    const trip = await trips.create({
      title: 'Plan', stops: STOPS, transits: TRANSITS, ownerId, costSettings: SETTINGS,
      costEstimate: estimateFor(STOPS, TRANSITS, SETTINGS, false),
    });

    const res = await request(app).put(`/trips/${trip.id}`).set('Authorization', `Bearer ${token}`)
      .send({ title: 'Renamed' });

    expect(res.body.costEstimate.stale).toBe(true);
    expect((await trips.findById(trip.id))!.costEstimate).not.toHaveProperty('stale');
  });
});

// ── GET /trips ─────────────────────────────────────────────────────────────
describe('GET /trips — stale marking', () => {
  it('marks only the trip whose snapshot is stale', async () => {
    const { app, users, trips } = buildApp();
    const token = await register(app);
    const ownerId = (await users.findByEmail('ana@test.com'))!.id;
    const stale = await trips.create({ title: 'Old', stops: STOPS, transits: TRANSITS, ownerId, costSettings: SETTINGS, costEstimate: estimateFor(STOPS, TRANSITS, SETTINGS, false) });
    const fresh = await trips.create({ title: 'New', stops: STOPS, transits: TRANSITS, ownerId, costSettings: SETTINGS, costEstimate: estimateFor(STOPS, TRANSITS, SETTINGS, true) });

    const res = await request(app).get('/trips').set('Authorization', `Bearer ${token}`);

    const byId = Object.fromEntries((res.body as { id: string; costEstimate: CostEstimate }[]).map(t => [t.id, t]));
    expect(byId[stale.id].costEstimate.stale).toBe(true);
    expect(byId[fresh.id].costEstimate).not.toHaveProperty('stale');
    expect((await trips.findById(stale.id))!.costEstimate).not.toHaveProperty('stale');
  });
});

// ── Shared clone ───────────────────────────────────────────────────────────
describe('POST /shared/:shareId/clone — cost fields', () => {
  it('copies costSettings and costEstimate into the repo create', async () => {
    const { app, trips } = buildApp();
    const token = await register(app);
    const source = await trips.create({
      title: 'Shared', stops: STOPS, transits: TRANSITS, ownerId: 'someone-else', costSettings: SETTINGS,
      costEstimate: estimateFor(STOPS, TRANSITS, SETTINGS, true),
    });
    await trips.setShareId(source.id, 'share-clone');
    const spy = jest.spyOn(trips, 'create');

    const res = await request(app).post('/shared/share-clone/clone').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(spy.mock.calls[0][0]).toMatchObject({ costSettings: SETTINGS, costEstimate: source.costEstimate });
  });
});

// ── GET /shared/:shareId ───────────────────────────────────────────────────
describe('GET /shared/:shareId — cost fields', () => {
  async function sharedWith(snapshot: CostEstimate | null): Promise<express.Express> {
    const { app, trips } = buildApp();
    const trip = await trips.create({ title: 'Shared', stops: STOPS, transits: TRANSITS, ownerId: 'owner-x', costSettings: SETTINGS, costEstimate: snapshot });
    await trips.setShareId(trip.id, 'share-get');
    return app;
  }

  it('reduces the origin to exactly name and countryCode', async () => {
    const app = await sharedWith(estimateFor(STOPS, TRANSITS, SETTINGS, true));
    const res = await request(app).get('/shared/share-get');

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.costSettings.origin).sort()).toEqual(['countryCode', 'name']);
    expect(Object.keys(res.body.costEstimate.settings.origin).sort()).toEqual(['countryCode', 'name']);
    expect(res.body.costEstimate.settings.origin).toEqual({ name: 'Santiago', countryCode: 'CL' });
  });

  it('sends costEstimate null when the snapshot is stale', async () => {
    const app = await sharedWith(estimateFor(STOPS, TRANSITS, SETTINGS, false));
    const res = await request(app).get('/shared/share-get');

    expect(res.status).toBe(200);
    expect(res.body.costEstimate).toBeNull();
    expect(res.body.costSettings.origin).toEqual({ name: 'Santiago', countryCode: 'CL' });
  });
});

// ── PUT /auth/profile — homePlace ──────────────────────────────────────────
describe('PUT /auth/profile — homePlace', () => {
  it('sets, then clears (null) the home place', async () => {
    const { app } = buildApp();
    const token = await register(app);

    const set = await request(app).put('/auth/profile').set('Authorization', `Bearer ${token}`)
      .send({ homePlace: SCL });
    expect(set.status).toBe(200);
    expect(set.body.user.homePlace).toEqual(SCL);

    const cleared = await request(app).put('/auth/profile').set('Authorization', `Bearer ${token}`)
      .send({ homePlace: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.user.homePlace).toBeNull();
  });

  it('rejects a malformed iata code with 400', async () => {
    const { app } = buildApp();
    const token = await register(app);
    const res = await request(app).put('/auth/profile').set('Authorization', `Bearer ${token}`)
      .send({ homePlace: { ...SCL, iata: 'scl' } });
    expect(res.status).toBe(400);
  });
});
