import type { Pool } from 'pg';
import { PgTripRepository } from '../src/repositories/pg/pg-trip.repository';

function fakePool() {
  const query = jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] as unknown[] }));
  return { pool: { query } as unknown as Pool, query };
}
const searchCall = (query: jest.Mock) => query.mock.calls.find(c => (c[0] as string).includes('t.share_id IS NOT NULL'))!;

describe('PgTripRepository.searchShared', () => {
  it('returns [] without querying for a blank query', async () => {
    const { pool, query } = fakePool();
    expect(await new PgTripRepository(pool).searchShared('   ')).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('compares accent-stripped, lowercased title and owner name', async () => {
    const { pool, query } = fakePool();
    await new PgTripRepository(pool).searchShared('PARÍS');
    const [sql, params] = searchCall(query);
    expect(sql).toMatch(/translate\(lower\(t\.title\)/);
    expect(sql).toMatch(/translate\(lower\(u\.name\)/);
    expect(params[0]).toBe('%paris%');
  });

  it('also matches trips with a stop in a matching city', async () => {
    const { pool, query } = fakePool();
    await new PgTripRepository(pool).searchShared('Barcelona');
    const [sql, params] = searchCall(query);
    expect(sql).toMatch(/FROM trip_stops s WHERE s\.trip_id = t\.trip_id AND s\.city_id = ANY\(\$4::text\[\]\)/);
    expect(params[3]).toContain('barcelona');
  });

  it('escapes LIKE wildcards so % and _ match literally', async () => {
    const { pool, query } = fakePool();
    await new PgTripRepository(pool).searchShared('100%_off');
    const [sql, params] = searchCall(query);
    expect(params[0]).toBe('%100\\%\\_off%');
    expect(sql).toContain("ESCAPE '\\'"); // JS string = one backslash, the SQL text the repo emits
  });
});
