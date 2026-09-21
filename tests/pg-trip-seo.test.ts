import type { Pool } from 'pg';
import { PgTripRepository } from '../src/repositories/pg/pg-trip.repository';

describe('PgTripRepository SEO queries', () => {
  const query = jest.fn();
  const pool = { query } as unknown as Pool;
  beforeEach(() => query.mockReset());

  it('findSeoRow maps a row and passes the share id as $1', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 'abc', title: 'T', updated_at: new Date('2026-09-01T00:00:00Z'),
      city_ids: ['paris', 'rome'], attraction_count: 4,
    }] });
    const repo = new PgTripRepository(pool);
    expect(await repo.findSeoRow('abc')).toEqual({
      id: 'abc', tripName: 'T', cityIds: ['paris', 'rome'], attractionCount: 4,
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(query.mock.calls[0][1]).toEqual(['abc']);
  });

  it('findSeoRow never selects owner columns (PII)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await new PgTripRepository(pool).findSeoRow('abc');
    const sql: string = query.mock.calls[0][0];
    expect(sql).not.toMatch(/owner_id|email|users/i);
  });

  it('findSeoRow returns null for an unknown share id', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await new PgTripRepository(pool).findSeoRow('nope')).toBeNull();
  });

  it('listSeoIndex passes the floor and limit, ISO-formats updatedAt and carries cityIds (filtered in the controller)', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'a', updated_at: new Date('2026-09-02T00:00:00Z'), city_ids: ['paris', 'zzz'] }] });
    const items = await new PgTripRepository(pool).listSeoIndex(3, 5000);
    expect(items).toEqual([{ id: 'a', updatedAt: '2026-09-02T00:00:00.000Z', cityIds: ['paris', 'zzz'] }]);
    expect(query.mock.calls[0][1]).toEqual([3, 5000]);
  });

  it('listSeoIndex never selects owner columns (PII)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await new PgTripRepository(pool).listSeoIndex(3, 5000);
    expect(String(query.mock.calls[0][0])).not.toMatch(/owner_id|email|users/i);
  });
});

describe('PgTripRepository.update bumps updated_at (sitemap <lastmod> depends on it)', () => {
  it('bumps updated_at even when only stops are edited (no title change)', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [] });
    const client = { query: clientQuery, release: jest.fn() };
    const pool = {
      // 1st call = existence check; the trailing findById() then finds nothing (irrelevant here).
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ trip_id: 't1' }] })
        .mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as Pool;

    await new PgTripRepository(pool).update('t1', { stops: [] });

    const sqls = clientQuery.mock.calls.map(c => String(c[0]));
    expect(sqls.some(s => /UPDATE trips SET[^;]*updated_at = now\(\)/.test(s))).toBe(true);
  });
});
