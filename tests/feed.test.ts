import request from 'supertest';
import express from 'express';
import { createHash } from 'crypto';
import { StubTripRepository } from './helpers/stubs';
import { TripController } from '../src/controllers/trip.controller';
import { createFeedRouter } from '../src/routes/landing.routes';
import { errorHandler } from '../src/middleware/error.middleware';
import { redis } from '../src/lib/redis';
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

async function seed(
  tripStub: StubTripRepository,
  o: { title: string; fav: number; createdAt: string; stops?: number; shared?: boolean },
) {
  const stops = Array.from({ length: o.stops ?? 1 }, () => ({
    cityId: 'paris', checkIn: '01/06/2026', checkOut: '05/06/2026',
    selectedAttractions: [{ attractionId: 'paris_0', startTime: null, endTime: null }],
  }));
  const trip = await tripStub.create({ title: o.title, ownerId: 'u1', transits: [], stops });
  if (o.shared !== false) {
    const shareId = `share-${o.title}`;
    await tripStub.setShareId(trip.id, shareId);
    tripStub.setFavoriteCount(shareId, o.fav);
  }
  tripStub.setCreatedAt(trip.id, o.createdAt);
  return trip;
}

describe('GET /feed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.incr as jest.Mock).mockResolvedValue(1);
  });

  it('401s without a token (feedback F2 — the feed is only for logged-in visitors)', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/feed');
    expect(res.status).toBe(401);
  });

  it('returns an empty page when nothing is shared', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/feed').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it('orders by favorites desc, then newest first', async () => {
    const { app, tripStub } = buildApp();
    await seed(tripStub, { title: 'A', fav: 1, createdAt: '2026-09-01T10:00:00.000Z' });
    await seed(tripStub, { title: 'B', fav: 3, createdAt: '2026-09-01T10:00:00.000Z' });
    await seed(tripStub, { title: 'C', fav: 3, createdAt: '2026-09-01T11:00:00.000Z' });
    const res = await request(app).get('/feed').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.body.items.map((i: { tripName: string }) => i.tripName)).toEqual(['C', 'B', 'A']);
  });

  it('excludes unshared plans and plans with no stops', async () => {
    const { app, tripStub } = buildApp();
    await seed(tripStub, { title: 'ok', fav: 0, createdAt: '2026-09-01T10:00:00.000Z' });
    await seed(tripStub, { title: 'private', fav: 9, createdAt: '2026-09-01T10:00:00.000Z', shared: false });
    await seed(tripStub, { title: 'empty', fav: 9, createdAt: '2026-09-01T10:00:00.000Z', stops: 0 });
    const res = await request(app).get('/feed').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.body.items.map((i: { tripName: string }) => i.tripName)).toEqual(['ok']);
  });

  it('paginates with the cursor and ends with nextCursor null; calling again without a cursor restarts', async () => {
    const { app, tripStub } = buildApp();
    await seed(tripStub, { title: 'A', fav: 1, createdAt: '2026-09-01T10:00:00.000Z' });
    await seed(tripStub, { title: 'B', fav: 3, createdAt: '2026-09-01T10:00:00.000Z' });
    await seed(tripStub, { title: 'C', fav: 3, createdAt: '2026-09-01T11:00:00.000Z' });

    const p1 = await request(app).get('/feed?limit=2').set('Authorization', `Bearer ${TOKEN}`);
    expect(p1.body.items).toHaveLength(2);
    expect(p1.body.nextCursor).toEqual(expect.any(String));

    const p2 = await request(app).get(`/feed?limit=2&cursor=${p1.body.nextCursor}`).set('Authorization', `Bearer ${TOKEN}`);
    expect(p2.body.items.map((i: { tripName: string }) => i.tripName)).toEqual(['A']);
    expect(p2.body.nextCursor).toBeNull();

    const all = [...p1.body.items, ...p2.body.items].map((i: { id: string }) => i.id);
    expect(new Set(all).size).toBe(3); // no duplicates across the boundary

    const restart = await request(app).get('/feed?limit=2').set('Authorization', `Bearer ${TOKEN}`);
    expect(restart.body.items.map((i: { id: string }) => i.id)).toEqual(p1.body.items.map((i: { id: string }) => i.id));
  });

  it('400s on a malformed cursor', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/feed?cursor=definitely-not-valid').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid cursor' });
  });

  it('clamps limit to 20 and falls back to 20 for junk', async () => {
    const { app, tripStub } = buildApp();
    const spy = jest.spyOn(tripStub, 'listFeed');
    await request(app).get('/feed?limit=999').set('Authorization', `Bearer ${TOKEN}`);
    await request(app).get('/feed?limit=abc').set('Authorization', `Bearer ${TOKEN}`);
    await request(app).get('/feed?limit=0').set('Authorization', `Bearer ${TOKEN}`);
    expect(spy.mock.calls.map(c => c[1])).toEqual([20, 20, 1]);
  });

  it('exposes only the public fields — no owner identity, transits, or per-viewer state', async () => {
    const { app, tripStub } = buildApp();
    await seed(tripStub, { title: 'A', fav: 2, createdAt: '2026-09-01T10:00:00.000Z' });
    const res = await request(app).get('/feed').set('Authorization', `Bearer ${TOKEN}`);
    const [item] = res.body.items;
    expect(Object.keys(item).sort()).toEqual(['createdAt', 'favoriteCount', 'id', 'ownerName', 'stops', 'tripName']);
    const raw = JSON.stringify(res.body);
    for (const banned of ['ownerEmail', 'ownerId', 'planId', 'tripId', 'transits', 'lodging', 'isFavoritedByMe']) {
      expect(raw).not.toContain(banned);
    }
  });

  it('serves a Redis cache hit without touching the repository', async () => {
    const { app, tripStub } = buildApp();
    // Seed enough data to have a next cursor when limit=5
    for (let i = 0; i < 6; i++) {
      await seed(tripStub, { title: String.fromCharCode(65 + i), fav: i, createdAt: `2026-09-01T${String(10 + i).padStart(2, '0')}:00:00.000Z` });
    }
    // Get a valid cursor from a first request (limit=5 to ensure there's a next page and avoid default limit 20)
    const p1 = await request(app).get('/feed?limit=5').set('Authorization', `Bearer ${TOKEN}`);
    const cursor = p1.body.nextCursor;
    expect(cursor).toBeDefined(); // verify there is a cursor
    // Now test cache hit with the same limit (non-first-page, so no background refresh)
    const spy = jest.spyOn(tripStub, 'listFeed');
    (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify({ items: [], nextCursor: 'from-cache' }));
    const res = await request(app).get(`/feed?limit=5&cursor=${cursor}`).set('Authorization', `Bearer ${TOKEN}`);
    expect(res.body).toEqual({ items: [], nextCursor: 'from-cache' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('writes a non-first-page cache miss with a 300 s TTL under a feed:{limit}: key', async () => {
    const { app } = buildApp();
    await request(app).get('/feed?limit=5').set('Authorization', `Bearer ${TOKEN}`);
    const [key, , mode, ttl] = (redis.set as jest.Mock).mock.calls[0];
    expect(key).toMatch(/^feed:5:[0-9a-f]{64}$/);
    expect([mode, ttl]).toEqual(['EX', 300]);
  });

  it('429s past 60 requests/minute', async () => {
    const { app } = buildApp();
    (redis.incr as jest.Mock).mockResolvedValueOnce(61);
    const res = await request(app).get('/feed').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(429);
  });
});

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const flush = () => new Promise(resolve => setTimeout(resolve, 20));

describe('GET /feed — first-page cache warming (feedback T1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.set as jest.Mock).mockResolvedValue('OK');
    (redis.incr as jest.Mock).mockResolvedValue(1);
  });

  it('writes a first-page cache miss with a 7200 s TTL, not the normal 300 s', async () => {
    const { app } = buildApp();
    await request(app).get('/feed').set('Authorization', `Bearer ${TOKEN}`);
    const call = (redis.set as jest.Mock).mock.calls.find(c => c[0] === `feed:20:${sha256('first')}`);
    expect(call).toBeDefined();
    expect([call![2], call![3]]).toEqual(['EX', 7200]);
  });

  it('background-refreshes the first page on a cache hit and re-caches it with a 7200 s TTL', async () => {
    const { app, tripStub } = buildApp();
    await seed(tripStub, { title: 'A', fav: 1, createdAt: '2026-09-01T10:00:00.000Z' });
    (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify({ items: [], nextCursor: null }));
    const spy = jest.spyOn(tripStub, 'listFeed');

    const res = await request(app).get('/feed').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.body).toEqual({ items: [], nextCursor: null }); // served from the stale cache immediately

    await flush(); // let the fire-and-forget waitUntil() promise run
    expect(spy).toHaveBeenCalledWith(null, 20);
    const refreshCall = (redis.set as jest.Mock).mock.calls.find(
      c => c[0] === `feed:20:${sha256('first')}` && c[3] === 7200,
    );
    expect(refreshCall).toBeDefined();
  });

  it('skips the background refresh when another request already holds the lock', async () => {
    const { app, tripStub } = buildApp();
    (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({ items: [], nextCursor: null }));
    (redis.set as jest.Mock).mockResolvedValueOnce(null); // NX lock already held elsewhere
    const spy = jest.spyOn(tripStub, 'listFeed');

    await request(app).get('/feed').set('Authorization', `Bearer ${TOKEN}`);
    await flush();
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not background-refresh a page that has a cursor, even at the default page size', async () => {
    const { app, tripStub } = buildApp();
    await seed(tripStub, { title: 'A', fav: 1, createdAt: '2026-09-01T10:00:00.000Z' });
    await seed(tripStub, { title: 'B', fav: 2, createdAt: '2026-09-01T11:00:00.000Z' });
    const p1 = await request(app).get('/feed?limit=1').set('Authorization', `Bearer ${TOKEN}`);
    const cursor = p1.body.nextCursor as string;

    const spy = jest.spyOn(tripStub, 'listFeed');
    (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify({ items: [], nextCursor: null }));
    await request(app).get(`/feed?cursor=${cursor}`).set('Authorization', `Bearer ${TOKEN}`); // default limit = 20
    await flush();
    expect(spy).not.toHaveBeenCalled();
  });
});
