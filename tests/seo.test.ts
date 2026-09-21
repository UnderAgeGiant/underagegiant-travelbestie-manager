import request from 'supertest';
import express from 'express';
import { StubTripRepository } from './helpers/stubs';
import { TripController } from '../src/controllers/trip.controller';
import { createSeoRouter } from '../src/routes/seo.routes';
import { errorHandler } from '../src/middleware/error.middleware';
import { buildSeoSummary, hasKnownCity, SEO_MIN_ATTRACTIONS } from '../src/lib/seo';

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

async function seedShared(tripStub: StubTripRepository, shareId: string, attractionCount: number, cityId = 'paris') {
  const stops = [{
    cityId, checkIn: '01/06/2026', checkOut: '05/06/2026',
    selectedAttractions: Array.from({ length: attractionCount }, (_, i) => ({
      attractionId: `${cityId}_${i}`, startTime: null, endTime: null,
    })),
  }];
  const trip = await tripStub.create({ title: `Trip ${shareId}`, ownerId: 'u1', transits: [], stops } as any);
  await tripStub.setShareId(trip.id, shareId);
  return trip;
}

describe('GET /seo/shared/:shareId', () => {
  it('returns a PII-free indexable summary', async () => {
    const { app, tripStub } = buildApp();
    await seedShared(tripStub, 'abc', SEO_MIN_ATTRACTIONS);
    const res = await request(app).get('/seo/shared/abc');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 'abc', tripName: 'Trip abc', cities: ['Paris'],
      attractionCount: SEO_MIN_ATTRACTIONS, updatedAt: expect.any(String), indexable: true,
    });
    expect(Object.keys(res.body).sort()).toEqual(
      ['attractionCount', 'cities', 'id', 'indexable', 'tripName', 'updatedAt']);
  });

  it('marks a thin plan (below the floor) as not indexable', async () => {
    const { app, tripStub } = buildApp();
    await seedShared(tripStub, 'thin', SEO_MIN_ATTRACTIONS - 1);
    const res = await request(app).get('/seo/shared/thin');
    expect(res.status).toBe(200);
    expect(res.body.indexable).toBe(false);
  });

  it('404s an unknown share id', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/seo/shared/nope');
    expect(res.status).toBe(404);
  });
});

describe('GET /seo/sitemap', () => {
  it('lists only shared plans at or above the attraction floor', async () => {
    const { app, tripStub } = buildApp();
    await seedShared(tripStub, 'good', SEO_MIN_ATTRACTIONS);
    await seedShared(tripStub, 'thin', SEO_MIN_ATTRACTIONS - 1);
    const res = await request(app).get('/seo/sitemap');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([{ id: 'good', updatedAt: expect.any(String) }]);
  });

  it('excludes a plan whose stops only use unknown city ids, keeps a known-city plan', async () => {
    const { app, tripStub } = buildApp();
    await seedShared(tripStub, 'known', SEO_MIN_ATTRACTIONS, 'paris');
    await seedShared(tripStub, 'unknown', SEO_MIN_ATTRACTIONS, 'zzz-unknown');
    const res = await request(app).get('/seo/sitemap');
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual(['known']);
  });

  it('keeps a plan with at least one known city among unknown ones', async () => {
    const { app, tripStub } = buildApp();
    const stops = ['zzz-unknown', 'rome'].map(cityId => ({
      cityId, checkIn: '01/06/2026', checkOut: '05/06/2026',
      selectedAttractions: Array.from({ length: 2 }, (_, i) => ({ attractionId: `${cityId}_${i}`, startTime: null, endTime: null })),
    }));
    const trip = await tripStub.create({ title: 'Mixed', ownerId: 'u1', transits: [], stops } as any);
    await tripStub.setShareId(trip.id, 'mixed');
    const res = await request(app).get('/seo/sitemap');
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual(['mixed']);
  });

  it('never leaks cityIds — each item has exactly { id, updatedAt }', async () => {
    const { app, tripStub } = buildApp();
    await seedShared(tripStub, 'good', SEO_MIN_ATTRACTIONS);
    const res = await request(app).get('/seo/sitemap');
    expect(Object.keys(res.body)).toEqual(['items']);
    expect(Object.keys(res.body.items[0]).sort()).toEqual(['id', 'updatedAt']);
  });

  it('lists exactly the plans /seo/shared/:id marks indexable', async () => {
    const { app, tripStub } = buildApp();
    await seedShared(tripStub, 'a', SEO_MIN_ATTRACTIONS, 'paris');
    await seedShared(tripStub, 'b', SEO_MIN_ATTRACTIONS, 'zzz-unknown');
    await seedShared(tripStub, 'c', SEO_MIN_ATTRACTIONS - 1, 'paris');
    const listed = (await request(app).get('/seo/sitemap')).body.items.map((i: { id: string }) => i.id).sort();
    const indexable: string[] = [];
    for (const id of ['a', 'b', 'c']) {
      if ((await request(app).get(`/seo/shared/${id}`)).body.indexable) indexable.push(id);
    }
    expect(listed).toEqual(indexable.sort());
  });

  it('returns an empty list when nothing qualifies', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/seo/sitemap');
    expect(res.body).toEqual({ items: [] });
  });
});

describe('hasKnownCity', () => {
  it('is true when at least one id resolves in CITY_NAMES, false otherwise', () => {
    expect(hasKnownCity(['zzz', 'paris'])).toBe(true);
    expect(hasKnownCity(['zzz'])).toBe(false);
    expect(hasKnownCity([])).toBe(false);
  });
});

describe('buildSeoSummary', () => {
  it('maps city ids to names, drops unknown ids, dedupes, keeps order', () => {
    const s = buildSeoSummary({
      id: 'x', tripName: 'T', cityIds: ['paris', 'zzz-unknown', 'rome', 'paris'],
      attractionCount: 5, updatedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(s.cities).toEqual(['Paris', 'Rome']);
    expect(s.indexable).toBe(true);
  });

  it('is not indexable when no city id resolves to a known name', () => {
    const s = buildSeoSummary({
      id: 'x', tripName: 'T', cityIds: ['zzz-unknown'], attractionCount: 9, updatedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(s.indexable).toBe(false);
  });
});
