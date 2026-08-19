import request from 'supertest';
import express from 'express';
import { StubTripRepository } from './helpers/stubs';
import { TripController }     from '../src/controllers/trip.controller';
import { StatsController }    from '../src/controllers/stats.controller';
import { createFeaturedRouter, createStatsRouter } from '../src/routes/landing.routes';
import { errorHandler } from '../src/middleware/error.middleware';
import { AppStats } from '../src/types';

// Mock Redis so findManyFeatured's cache-first path is a no-op in tests
jest.mock('../src/lib/redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') },
}));

const MOCK_STATS: AppStats = { cities: 5, users: 100, plans: 42 };

class StubStatsRepository {
  async get(): Promise<AppStats> { return MOCK_STATS; }
}

function buildApp(featuredTripIds = '') {
  process.env.FEATURED_TRIP_IDS = featuredTripIds;
  const tripStub  = new StubTripRepository();
  const statsStub = new StubStatsRepository();
  const app = express();
  app.use(express.json());
  app.use('/featured', createFeaturedRouter(new TripController(tripStub)));
  app.use('/stats',    createStatsRouter(new StatsController(statsStub as any)));
  app.use(errorHandler);
  return { app, tripStub };
}

// ── GET /featured ──────────────────────────────────────────────────────────
describe('GET /featured', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with an empty array when FEATURED_TRIP_IDS is not set', async () => {
    const { app } = buildApp('');
    const res = await request(app).get('/featured');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns matched trips when share ID exists', async () => {
    const { app, tripStub } = buildApp('share-abc');
    const trip = await tripStub.create({
      title: 'Rome',
      stops: [{ cityId: 'paris', checkIn: '01/06/2026', checkOut: '05/06/2026', selectedAttractions: [] }],
      transits: [],
      ownerId: 'user-1',
    });
    await tripStub.setShareId(trip.id, 'share-abc');

    const res = await request(app).get('/featured');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].tripName).toBe('Rome');
    expect(res.body[0].ownerEmail).toBeUndefined();
  });

  it('skips share IDs that do not exist in the DB', async () => {
    const { app } = buildApp('nonexistent-id');
    const res = await request(app).get('/featured');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ── GET /stats ─────────────────────────────────────────────────────────────
describe('GET /stats', () => {
  it('returns 200 with stats object', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ cities: 5, users: 100, plans: 42 });
  });
});
