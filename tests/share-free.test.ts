import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubTripRepository, StubKarmaRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { TripController } from '../src/controllers/trip.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createTripsRouter } from '../src/routes/trips.routes';
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

// Build an app, optionally sharing a trip repo so two apps see the same trips.
function buildApp(karmaScore: number, tripRepo = new StubTripRepository()) {
  const app = express();
  app.use(express.json());
  app.use('/auth',  createAuthRouter(new UserController(new StubUserRepository())));
  app.use('/trips', createTripsRouter(new TripController(tripRepo), new KarmaController(new StubKarmaRepository(karmaScore))));
  app.use(errorHandler);
  return { app, tripRepo };
}

async function token(app: express.Express): Promise<string> {
  const res = await request(app).post('/auth/register').send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

describe('POST /trips/:id/share — free sharing', () => {
  it('shares successfully even with zero karma', async () => {
    // richApp (karma=100) creates the trip; poorApp (karma=0) shares it.
    // Both use the same JWT secret so the token is valid across apps.
    const sharedRepo = new StubTripRepository();
    const { app: richApp } = buildApp(100, sharedRepo);
    const { app: poorApp } = buildApp(0, sharedRepo);

    const t = await token(richApp);
    const created = await request(richApp).post('/trips')
      .set('Authorization', `Bearer ${t}`)
      .send({ title: 'Trip', stops: [{ cityId: 'paris', checkIn: '01/06/2026', checkOut: '03/06/2026', selectedAttractions: [] }], transits: [] });

    const res = await request(poorApp).post(`/trips/${created.body.id}/share`).set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.shareId).toBeTruthy();
  });
});
