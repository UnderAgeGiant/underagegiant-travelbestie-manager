import request from 'supertest';
import express from 'express';
import {
  StubUserRepository, StubTripRepository, StubKarmaRepository,
  StubFavoriteRepository, StubNotificationRepository, StubCollaboratorRepository,
} from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { TripController } from '../src/controllers/trip.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { CollaboratorController } from '../src/controllers/collaborator.controller';
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

jest.mock('../src/lib/refresh-tokens', () => ({
  REFRESH_TTL:            86400,
  issueRefreshToken:      jest.fn().mockResolvedValue('mock-refresh-token'),
  validateAndRotate:      jest.fn(),
  revokeRefreshToken:     jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));

function buildApp() {
  const notificationRepo = new StubNotificationRepository();
  const users = new StubUserRepository();
  const trips = new StubTripRepository();
  const collaboratorRepo = new StubCollaboratorRepository(users, trips);
  const tripCtrl  = new TripController(trips);
  const karmaCtrl = new KarmaController(new StubKarmaRepository());
  const app = express();
  app.use(express.json());
  app.use('/auth',   createAuthRouter(new UserController(users)));
  app.use('/trips',  createTripsRouter(
    tripCtrl, karmaCtrl, new CollaboratorController(collaboratorRepo), collaboratorRepo, users, trips, notificationRepo,
  ));
  app.use('/shared', createSharedRouter(tripCtrl, karmaCtrl, new StubFavoriteRepository(), notificationRepo));
  app.use(errorHandler);
  return { app, notificationRepo };
}

async function getToken(app: express.Express, email: string, name: string): Promise<string> {
  const res = await request(app)
    .post('/auth/register')
    .send({ name, email, password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

function decodeUserId(token: string): string {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { userId: string };
  return payload.userId;
}

async function createAndShareTrip(app: express.Express, token: string): Promise<string> {
  const created = await request(app)
    .post('/trips')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Roma en 5 días', stops: [], transits: [] });
  const shared = await request(app)
    .post(`/trips/${created.body.id}/share`)
    .set('Authorization', `Bearer ${token}`);
  return shared.body.shareId as string;
}

describe('notification on shared-trip clone', () => {
  it('1 — non-owner clones → owner gets a clone notification with share deep-link', async () => {
    const { app, notificationRepo } = buildApp();
    const ownerToken = await getToken(app, 'owner@test.com', 'Olivia');
    const shareId = await createAndShareTrip(app, ownerToken);
    const clonerToken = await getToken(app, 'cloner@test.com', 'Carla');

    const res = await request(app)
      .post(`/shared/${shareId}/clone`)
      .set('Authorization', `Bearer ${clonerToken}`);

    expect(res.status).toBe(201);
    const rows = await notificationRepo.listByUser(decodeUserId(ownerToken));
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('clone');
    expect(rows[0].url).toBe(`/?share=${shareId}`);
    expect(rows[0].body).toContain('Carla');
    expect(rows[0].body).toContain('Roma en 5 días');
  });

  it('2 — owner clones own shared trip → no notification', async () => {
    const { app, notificationRepo } = buildApp();
    const ownerToken = await getToken(app, 'owner@test.com', 'Olivia');
    const shareId = await createAndShareTrip(app, ownerToken);

    const res = await request(app)
      .post(`/shared/${shareId}/clone`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(201);
    expect(notificationRepo.items).toHaveLength(0);
  });
});
