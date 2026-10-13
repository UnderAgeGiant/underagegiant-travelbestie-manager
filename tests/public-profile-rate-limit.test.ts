import express from 'express';
import request from 'supertest';
import { StubUserRepository, StubFollowRepository, StubTripRepository, StubTrophyRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { createPublicProfileRouter } from '../src/routes/public-profile.routes';
import { errorHandler } from '../src/middleware/error.middleware';

// Real rate-limit middleware; only the Redis client is faked (31 hits = over the 30/min cap).
jest.mock('../src/lib/redis', () => ({
  redis: {
    incr:   jest.fn().mockResolvedValue(31),
    expire: jest.fn().mockResolvedValue(1),
  },
}));

describe('GET /u rate limits run before username validation', () => {
  it('returns 429 (not 404/400) for a malformed username once the per-IP budget is spent', async () => {
    const app = express();
    app.use('/u', createPublicProfileRouter(
      new UserController(new StubUserRepository()),
      new StubTripRepository(),
      new StubFollowRepository(),
      new StubTrophyRepository(),
    ));
    app.use(errorHandler);

    const res = await request(app).get('/u/%27%3Bdrop');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('60');
  });
});
