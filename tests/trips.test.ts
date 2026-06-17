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

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth',  createAuthRouter(new UserController(new StubUserRepository())));
  app.use('/trips', createTripsRouter(new TripController(new StubTripRepository()), new KarmaController(new StubKarmaRepository())));
  app.use(errorHandler);
  return app;
}

async function getToken(app: express.Express): Promise<string> {
  const res = await request(app).post('/auth/register').send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

describe('GET /trips', () => {
  it('returns 401 without token', async () => {
    expect((await request(buildApp()).get('/trips')).status).toBe(401);
  });

  it('returns empty array for new user', async () => {
    const app = buildApp();
    const res = await request(app).get('/trips').set('Authorization', `Bearer ${await getToken(app)}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /trips', () => {
  it('creates a trip with stops and transits', async () => {
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app).post('/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Europe 2026',
        stops: [{ cityId: 'paris', checkIn: '01/06/2026', checkOut: '05/06/2026', selectedAttractions: [] }],
        transits: [{ fromCityId: 'london', toCityId: 'paris', segments: [{ mode: 'flight', departureDate: '01/06/2026', departureTime: '07:00', arrivalDate: '01/06/2026', arrivalTime: '09:30', notes: 'LA 706' }] }],
      });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Europe 2026');
    expect(res.body.transits).toHaveLength(1);
  });

  it('returns 400 when title missing', async () => {
    const app = buildApp();
    const res = await request(app).post('/trips').set('Authorization', `Bearer ${await getToken(app)}`).send({ stops: [] });
    expect(res.status).toBe(400);
  });

  it('preserves category on planned attractions', async () => {
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app).post('/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Category Test',
        stops: [{
          cityId: 'paris',
          checkIn: '01/06/2026',
          checkOut: '05/06/2026',
          selectedAttractions: [
            { attractionId: 'paris_0', startTime: '09:00', date: '02/06/2026', category: 'freetour' },
            { attractionId: 'paris_1', startTime: null, date: null },
          ],
        }],
        transits: [],
      });
    expect(res.status).toBe(201);
    const stop = res.body.stops[0];
    expect(stop.selectedAttractions[0].category).toBe('freetour');
    expect(stop.selectedAttractions[1].category).toBeUndefined();
  });
});

describe('PUT /trips/:id', () => {
  it('updates a trip title and transits', async () => {
    const app = buildApp();
    const token = await getToken(app);
    const created = await request(app).post('/trips').set('Authorization', `Bearer ${token}`).send({ title: 'Asia', stops: [], transits: [] });
    const res = await request(app).put(`/trips/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Asia 2026', transits: [] });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Asia 2026');
  });

  it('returns 404 for unknown trip', async () => {
    const app = buildApp();
    const res = await request(app).put('/trips/bad-id').set('Authorization', `Bearer ${await getToken(app)}`).send({ title: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /trips/:id', () => {
  it('deletes a trip and returns 204', async () => {
    const app = buildApp();
    const token = await getToken(app);
    const created = await request(app).post('/trips').set('Authorization', `Bearer ${token}`).send({ title: 'Del', stops: [], transits: [] });
    expect((await request(app).delete(`/trips/${created.body.id}`).set('Authorization', `Bearer ${token}`)).status).toBe(204);
  });
});
