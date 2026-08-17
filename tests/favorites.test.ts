import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubTripRepository, StubKarmaRepository, StubFavoriteRepository, StubNotificationRepository, StubCollaboratorRepository, StubHighlightRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { TripController } from '../src/controllers/trip.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { CollaboratorController } from '../src/controllers/collaborator.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createTripsRouter } from '../src/routes/trips.routes';
import { createSharedRouter } from '../src/routes/shared.routes';
import { createFavoritesRouter } from '../src/routes/favorites.routes';
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
  const userRepo    = new StubUserRepository();
  const tripRepo    = new StubTripRepository();
  const karmaRepo   = new StubKarmaRepository();
  const favoriteRepo = new StubFavoriteRepository();
  const collaboratorRepo = new StubCollaboratorRepository(userRepo, tripRepo);

  const userController  = new UserController(userRepo);
  const tripController  = new TripController(tripRepo);
  const karmaController = new KarmaController(karmaRepo);

  const app = express();
  app.use(express.json());
  app.use('/auth',      createAuthRouter(userController, new StubHighlightRepository()));
  app.use('/trips',     createTripsRouter(
    tripController, karmaController, new CollaboratorController(collaboratorRepo), collaboratorRepo, userRepo, tripRepo, new StubNotificationRepository(),
  ));
  app.use('/shared',    createSharedRouter(tripController, karmaController, favoriteRepo, new StubNotificationRepository()));
  app.use('/favorites', createFavoritesRouter(favoriteRepo));
  app.use(errorHandler);

  return { app, tripRepo, favoriteRepo };
}

async function getToken(app: express.Express, email = 'ana@test.com'): Promise<string> {
  const res = await request(app)
    .post('/auth/register')
    .send({ name: 'Ana', email, password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

async function createAndShareTrip(app: express.Express, token: string, title = 'Paris 2026') {
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

// ─── POST /shared/:shareId/favorite ─────────────────────────────────────────

describe('POST /shared/:shareId/favorite', () => {
  it('1 — authenticated, not yet favourited → 200 favorited:true count:1', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const { shareId } = await createAndShareTrip(app, token);

    const res = await request(app)
      .post(`/shared/${shareId}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.favorited).toBe(true);
    expect(res.body.favoriteCount).toBe(1);
  });

  it('2 — authenticated, toggle off (already favourited) → 200 favorited:false count:0', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const { shareId } = await createAndShareTrip(app, token);

    await request(app)
      .post(`/shared/${shareId}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/shared/${shareId}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.favorited).toBe(false);
    expect(res.body.favoriteCount).toBe(0);
  });

  it('3 — shareId not found → 404', async () => {
    const { app } = buildApp();
    const token = await getToken(app);

    const res = await request(app)
      .post('/shared/nonexistent-share-id/favorite')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('4 — no Authorization header → 401', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const { shareId } = await createAndShareTrip(app, token);

    const res = await request(app)
      .post(`/shared/${shareId}/favorite`);

    expect(res.status).toBe(401);
  });
});

// ─── GET /favorites ──────────────────────────────────────────────────────────

describe('GET /favorites', () => {
  it('5 — authenticated, no favourites → 200 empty array', async () => {
    const { app } = buildApp();
    const token = await getToken(app);

    const res = await request(app)
      .get('/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('6 — authenticated, two favourited trips → 200 array length 2 with favoritedAt', async () => {
    const { app, favoriteRepo } = buildApp();
    const token = await getToken(app);

    const { shareId: shareId1, tripId: tripId1 } = await createAndShareTrip(app, token, 'Trip A');
    const { shareId: shareId2, tripId: tripId2 } = await createAndShareTrip(app, token, 'Trip B');

    await request(app).post(`/shared/${shareId1}/favorite`).set('Authorization', `Bearer ${token}`);
    await request(app).post(`/shared/${shareId2}/favorite`).set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get('/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty('favoritedAt');
    expect(res.body[1]).toHaveProperty('favoritedAt');
  });

  it('7 — no Authorization header → 401', async () => {
    const { app } = buildApp();

    const res = await request(app).get('/favorites');

    expect(res.status).toBe(401);
  });
});

// ─── GET /shared/:shareId — favorite meta ───────────────────────────────────

describe('GET /shared/:shareId — favorite meta', () => {
  it('8 — no auth header → 200 with favoriteCount and isFavoritedByMe:false', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const { shareId } = await createAndShareTrip(app, token);

    const res = await request(app).get(`/shared/${shareId}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.favoriteCount).toBe('number');
    expect(res.body.isFavoritedByMe).toBe(false);
  });

  it('9 — valid auth, user has NOT favourited → isFavoritedByMe:false', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const { shareId } = await createAndShareTrip(app, token);

    const res = await request(app)
      .get(`/shared/${shareId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.isFavoritedByMe).toBe(false);
  });

  it('10 — valid auth, user HAS favourited → isFavoritedByMe:true', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const { shareId } = await createAndShareTrip(app, token);

    await request(app)
      .post(`/shared/${shareId}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get(`/shared/${shareId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.isFavoritedByMe).toBe(true);
    expect(res.body.favoriteCount).toBe(1);
  });
});
