import request from 'supertest';
import express from 'express';
import { StubTripRepository } from './helpers/stubs';
import { TripController } from '../src/controllers/trip.controller';
import { createFeedRouter } from '../src/routes/landing.routes';
import { errorHandler } from '../src/middleware/error.middleware';
import { signToken } from '../src/lib/jwt';

jest.mock('../src/lib/redis', () => ({
  redis: {
    get:    jest.fn().mockResolvedValue(null),
    set:    jest.fn().mockResolvedValue('OK'),
    incr:   jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  },
}));

const TOKEN = signToken({ userId: 'u1', email: 'a@b.com', name: 'Ana' });

function buildApp() {
  const tripStub = new StubTripRepository();
  const app = express();
  app.use(express.json());
  app.use('/feed', createFeedRouter(new TripController(tripStub)));
  app.use(errorHandler);
  return { app, tripStub };
}

describe('GET /feed/following', () => {
  it('requires auth', async () => {
    const { app } = buildApp();
    expect((await request(app).get('/feed/following')).status).toBe(401);
  });

  it('returns the stub page and 400s a bad cursor', async () => {
    const { app } = buildApp();
    const ok = await request(app).get('/feed/following').set('Authorization', `Bearer ${TOKEN}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ items: [], nextCursor: null });
    expect((await request(app).get('/feed/following?cursor=junk').set('Authorization', `Bearer ${TOKEN}`)).status).toBe(400);
  });
});
