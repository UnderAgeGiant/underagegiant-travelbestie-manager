import type { Pool } from 'pg';
import { PgRankingRepository } from '../src/repositories/pg/pg-ranking.repository';
import { redis } from '../src/lib/redis';

jest.mock('../src/lib/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn() },
}));

const WS = '2026-09-28';

/** Answers each query by matching a marker comment in the SQL. */
function fakePool(byMarker: Record<string, object[]>) {
  const query = jest.fn(async (sql: string) => {
    const marker = Object.keys(byMarker).find(m => sql.includes(`/*${m}*/`));
    return { rows: marker ? byMarker[marker] : [] };
  });
  return { pool: { query } as unknown as Pool, query };
}

describe('PgRankingRepository.getWeekly', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.set as jest.Mock).mockResolvedValue('OK');
  });

  it('returns the cached value without querying on a hit', async () => {
    const cached = { weekStart: WS, generatedAt: '2026-10-04T10:00:00.000Z', topPlanners: [], topDestinations: [], topTrophies: [], topFavorited: [] };
    (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(cached));
    const { pool, query } = fakePool({});
    expect(await new PgRankingRepository(pool).getWeekly(WS)).toEqual(cached);
    expect(redis.get).toHaveBeenCalledWith('rankings:2026-09-28');
    expect(query).not.toHaveBeenCalled();
  });

  it('on a miss runs the 4 queries with the week start, maps rows, and caches for 7200 s', async () => {
    const { pool, query } = fakePool({
      planners:     [{ name: 'Ana', value: 7 }],
      destinations: [{ cityId: 'paris', value: 34 }],
      trophies:     [{ name: 'Luis', value: 3 }],
      favorited:    [{ title: 'Europa', shareId: 's1', ownerName: 'Ana', value: 12 }],
    });
    const res = await new PgRankingRepository(pool).getWeekly(WS);
    expect(res).toMatchObject({
      weekStart: WS,
      topPlanners: [{ name: 'Ana', value: 7 }],
      topDestinations: [{ cityId: 'paris', value: 34 }],
      topTrophies: [{ name: 'Luis', value: 3 }],
      topFavorited: [{ title: 'Europa', shareId: 's1', ownerName: 'Ana', value: 12 }],
    });
    expect(Number.isNaN(Date.parse(res.generatedAt))).toBe(false);
    expect(query).toHaveBeenCalledTimes(4);
    for (const call of query.mock.calls as any[]) {
      expect(call[1]).toEqual([WS, 3]);
      expect(call[0]).toContain("AT TIME ZONE 'America/Santiago'");
      expect(call[0]).toContain('LIMIT $2');
      expect(call[0]).not.toMatch(/email/i);
    }
    const favSql = (query.mock.calls as any[]).find(c => c[0].includes('/*favorited*/'))[0];
    expect(favSql).toContain('share_id IS NOT NULL');
    expect(redis.set).toHaveBeenCalledWith('rankings:2026-09-28', JSON.stringify(res), 'EX', 7200);
  });

  it('still answers from the DB when Redis throws (Review Focus 3)', async () => {
    (redis.get as jest.Mock).mockRejectedValue(new Error('down'));
    (redis.set as jest.Mock).mockRejectedValue(new Error('down'));
    const { pool } = fakePool({ planners: [{ name: 'Ana', value: 1 }] });
    const res = await new PgRankingRepository(pool).getWeekly(WS);
    expect(res.topPlanners).toEqual([{ name: 'Ana', value: 1 }]);
  });
});

describe('PgRankingRepository.getMine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.set as jest.Mock).mockResolvedValue('OK');
  });

  it('maps found rows to {rank,value} and missing ones to null, caching per user', async () => {
    const { pool, query } = fakePool({
      'me-planners':  [{ rank: 14, value: 2 }],
      'me-favorited': [{ rank: 5, value: 1 }],
    });
    const res = await new PgRankingRepository(pool).getMine(WS, 'u1');
    expect(res).toEqual({ weekStart: WS, planners: { rank: 14, value: 2 }, trophies: null, favorited: { rank: 5, value: 1 } });
    expect(query).toHaveBeenCalledTimes(3);
    for (const call of query.mock.calls as any[]) {
      expect(call[1]).toEqual([WS, 'u1']);
      // rank = 1 + number of entities with a STRICTLY greater value (ties share a rank) — Review Focus 4
      expect(call[0]).toContain('o.value > m.value');
    }
    expect(redis.set).toHaveBeenCalledWith('rankings:me:2026-09-28:u1', JSON.stringify(res), 'EX', 7200);
  });

  it('returns the cached value on a hit', async () => {
    const cached = { weekStart: WS, planners: null, trophies: null, favorited: null };
    (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(cached));
    const { pool, query } = fakePool({});
    expect(await new PgRankingRepository(pool).getMine(WS, 'u1')).toEqual(cached);
    expect(query).not.toHaveBeenCalled();
  });
});
