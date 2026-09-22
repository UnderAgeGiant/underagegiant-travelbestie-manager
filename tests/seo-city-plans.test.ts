import request from 'supertest';
import express from 'express';
import { StubTripRepository } from './helpers/stubs';
import { TripController } from '../src/controllers/trip.controller';
import { createSeoRouter } from '../src/routes/seo.routes';
import { errorHandler } from '../src/middleware/error.middleware';
import { buildSeoCityPlans, SEO_MIN_ATTRACTIONS, SEO_CITY_PLANS_LIMIT } from '../src/lib/seo';

jest.mock('../src/lib/redis', () => ({
  redis: {
    get:    jest.fn().mockResolvedValue(null),
    set:    jest.fn().mockResolvedValue('OK'),
    incr:   jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  },
}));

function buildApp() {
  const tripStub = new StubTripRepository();
  const app = express();
  app.use(express.json());
  app.use('/seo', createSeoRouter(new TripController(tripStub)));
  app.use(errorHandler);
  return { app, tripStub };
}

async function seedPlan(
  tripStub: StubTripRepository,
  shareId: string | null,
  stops: { cityId: string; attractions: number }[],
  favorites = 0,
) {
  const built = stops.map(s => ({
    cityId: s.cityId, checkIn: '01/06/2026', checkOut: '05/06/2026',
    selectedAttractions: Array.from({ length: s.attractions }, (_, i) => ({
      attractionId: `${s.cityId}_${i}`, startTime: null, endTime: null,
    })),
  }));
  const trip = await tripStub.create({ title: `Plan ${shareId ?? 'private'}`, ownerId: 'u1', transits: [], stops: built });
  if (shareId) { await tripStub.setShareId(trip.id, shareId); tripStub.setFavoriteCount(shareId, favorites); }
  return trip;
}

describe('GET /seo/city/:cityId/plans', () => {
  it('lists shared plans through the city, most favorited first, PII-free', async () => {
    const { app, tripStub } = buildApp();
    await seedPlan(tripStub, 'low',  [{ cityId: 'paris', attractions: 3 }], 1);
    await seedPlan(tripStub, 'high', [{ cityId: 'rome', attractions: 2 }, { cityId: 'paris', attractions: 2 }], 9);
    const res = await request(app).get('/seo/city/paris/plans');
    expect(res.status).toBe(200);
    expect(res.body.items.map((p: any) => p.id)).toEqual(['high', 'low']);
    expect(res.body.items[0]).toEqual({
      id: 'high', tripName: 'Plan high', cities: ['Rome', 'Paris'], attractionCount: 4, favoriteCount: 9,
    });
    expect(Object.keys(res.body.items[0]).sort()).toEqual(['attractionCount', 'cities', 'favoriteCount', 'id', 'tripName']);
  });

  it('excludes thin plans, other cities and unshared plans', async () => {
    const { app, tripStub } = buildApp();
    await seedPlan(tripStub, 'thin',  [{ cityId: 'paris', attractions: SEO_MIN_ATTRACTIONS - 1 }]);
    await seedPlan(tripStub, 'other', [{ cityId: 'rome', attractions: 5 }]);
    await seedPlan(tripStub, null,    [{ cityId: 'paris', attractions: 5 }]);
    const res = await request(app).get('/seo/city/paris/plans');
    expect(res.body).toEqual({ items: [] });
  });

  it(`caps the list at ${SEO_CITY_PLANS_LIMIT}`, async () => {
    const { app, tripStub } = buildApp();
    for (let i = 0; i < SEO_CITY_PLANS_LIMIT + 3; i++) await seedPlan(tripStub, `p${i}`, [{ cityId: 'paris', attractions: 3 }], i);
    const res = await request(app).get('/seo/city/paris/plans');
    expect(res.body.items).toHaveLength(SEO_CITY_PLANS_LIMIT);
  });

  it('400s a malformed city id', async () => {
    const { app } = buildApp();
    expect((await request(app).get('/seo/city/Paris!/plans')).status).toBe(400);
    expect((await request(app).get(`/seo/city/${'a'.repeat(41)}/plans`)).status).toBe(400);
  });
});

describe('buildSeoCityPlans', () => {
  it('maps ids to names, dedupes, drops plans whose cities are all unknown', () => {
    const base = { tripName: 'T', attractionCount: 5, updatedAt: '2026-09-01T00:00:00.000Z', favoriteCount: 2 };
    const out = buildSeoCityPlans([
      { ...base, id: 'a', cityIds: ['paris', 'zzz', 'paris', 'rome'] },
      { ...base, id: 'b', cityIds: ['zzz'] },
    ]);
    expect(out).toEqual([{ id: 'a', tripName: 'T', cities: ['Paris', 'Rome'], attractionCount: 5, favoriteCount: 2 }]);
  });
});
