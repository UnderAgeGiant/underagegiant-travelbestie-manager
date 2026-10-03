import request from 'supertest';
import express from 'express';
import {
  StubUserRepository, StubTripRepository, StubKarmaRepository, StubNotificationRepository,
  StubCollaboratorRepository, StubHighlightRepository, StubTrophyRepository,
} from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { TripController } from '../src/controllers/trip.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { CollaboratorController } from '../src/controllers/collaborator.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createTripsRouter } from '../src/routes/trips.routes';
import { createTrophiesRouter } from '../src/routes/trophies.routes';
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
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(users), new StubHighlightRepository()));
  app.use('/trips', createTripsRouter(tripCtrl, new KarmaController(new StubKarmaRepository()),
    new CollaboratorController(collaboratorRepo), collaboratorRepo, users, trips, notificationRepo, recorder));
  app.use('/trophies', createTrophiesRouter(trophyRepo, tripCtrl, recorder));
  app.use(errorHandler);
  return { app };
}

async function token(app: express.Express): Promise<string> {
  const res = await request(app).post('/auth/register').send({ name: 'A', email: 'a@x.com', password: 'secret123', otp: '123456' });
  return res.body.token;
}

describe('/trophies', () => {
  it('GET requires auth', async () => {
    const { app } = buildApp();
    expect((await request(app).get('/trophies')).status).toBe(401);
  });

  it('GET returns earned + progress', async () => {
    const { app } = buildApp();
    const t = await token(app);
    const created = await request(app).post('/trips').set('Authorization', `Bearer ${t}`).send({ title: 'R', stops: [], transits: [] });
    await request(app).post(`/trips/${created.body.id}/share`).set('Authorization', `Bearer ${t}`);
    const res = await request(app).get('/trophies').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.earned).toEqual([expect.objectContaining({ type: 'publish_plan', tier: 'single' })]);
    expect(res.body.progress).toEqual({ publish_plan: 1 });
  });

  it('POST /share/:shareId → 204 + header the first time, 204 without header after, 404 unknown', async () => {
    const { app } = buildApp();
    const t = await token(app);
    const created = await request(app).post('/trips').set('Authorization', `Bearer ${t}`).send({ title: 'R', stops: [], transits: [] });
    const { body: { shareId } } = await request(app).post(`/trips/${created.body.id}/share`).set('Authorization', `Bearer ${t}`);

    const first = await request(app).post(`/trophies/share/${shareId}`).set('Authorization', `Bearer ${t}`);
    expect(first.status).toBe(204);
    expect(JSON.parse(first.headers['x-new-trophies'])[0]).toMatchObject({ type: 'share_plan', tier: 'single' });

    const again = await request(app).post(`/trophies/share/${shareId}`).set('Authorization', `Bearer ${t}`);
    expect(again.status).toBe(204);
    expect(again.headers['x-new-trophies']).toBeUndefined();

    expect((await request(app).post('/trophies/share/does-not-exist').set('Authorization', `Bearer ${t}`)).status).toBe(404);
  });
});
