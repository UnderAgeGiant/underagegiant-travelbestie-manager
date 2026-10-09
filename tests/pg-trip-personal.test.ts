import type { Pool } from 'pg';
import { PgTripRepository } from '../src/repositories/pg/pg-trip.repository';

const TRIP = { trip_id: 't1', title: 'Viaje', owner_id: 'u1', created_at: new Date('2026-10-01T00:00:00Z'),
  updated_at: new Date('2026-10-01T00:00:00Z'), share_id: 's1', owner_email: 'a@b.c', owner_name: 'Ana' };
const STOP = { stop_id: 'st1', trip_id: 't1', city_id: 'paris', check_in: '2026-10-01', check_out: '2026-10-03' };
const PERSONAL = { stop_id: 'st1', attraction_id: null, activity_type: 'lunch', title: 'Almuerzo', maps_url: 'https://maps.app.goo.gl/x',
  is_private: true, start_time: '13:00:00', end_time: '14:00:00', date: '2026-10-01', category: null, ticket_purchased: false };

function fakePool() {
  const query = jest.fn(async (sql: string) => {
    // listFeed's ranked CTE also contains 'FROM trip_stops' (its EXISTS) — route it first.
    if (sql.includes('WITH ranked')) return { rows: [{ ...TRIP, created_at_raw: '2026-10-01 00:00:00+00', favorite_count: 0 }] };
    if (sql.includes('FROM planned_attractions')) return { rows: [PERSONAL] };
    // searchShared has a trip_stops subquery but is a top-level trips query — check the main FROM first
    if (sql.includes('FROM trips t') && sql.includes('JOIN users u')) return { rows: [TRIP] };
    if (sql.includes('FROM trip_stops'))          return { rows: [STOP] };
    if (sql.includes('FROM trips'))               return { rows: [TRIP] };
    return { rows: [] };
  });
  return { pool: { query } as unknown as Pool, query };
}
const attrSql = (query: jest.Mock) =>
  query.mock.calls.map(c => c[0] as string).filter(s => s.includes('FROM planned_attractions'));

describe('personal activities in PgTripRepository', () => {
  it('maps a personal row to activityType/title/mapsUrl/isPrivate with no attractionId', async () => {
    const { pool } = fakePool();
    const trip = await new PgTripRepository(pool).findById('t1');
    expect(trip!.stops[0].selectedAttractions[0]).toEqual({
      activityType: 'lunch', title: 'Almuerzo', mapsUrl: 'https://maps.app.goo.gl/x', isPrivate: true,
      startTime: '13:00', endTime: '14:00', date: '01/10/2026',
    });
  });

  it('owner reads do NOT filter private rows', async () => {
    const { pool, query } = fakePool();
    await new PgTripRepository(pool).findById('t1');
    await new PgTripRepository(pool).findByOwner('u1');
    // is_private is SELECTed (the owner sees the flag) but never used as a filter.
    for (const sql of attrSql(query)) expect(sql).not.toMatch(/NOT is_private/);
  });

  it.each(['findByShareId', 'findManyByShareIds', 'searchShared', 'listFeed'] as const)('%s filters private rows in SQL', async method => {
    const { pool, query } = fakePool();
    const repo = new PgTripRepository(pool) as any;
    if (method === 'findByShareId') await repo.findByShareId('s1');
    if (method === 'findManyByShareIds') await repo.findManyByShareIds(['s1']);
    if (method === 'searchShared') await repo.searchShared('Viaje');
    if (method === 'listFeed') await repo.listFeed(null, 20);
    const sqls = attrSql(query);
    expect(sqls.length).toBeGreaterThan(0);
    for (const sql of sqls) expect(sql).toMatch(/NOT is_private/);
  });

  it('feed items carry activityType/title/mapsUrl for public personal rows and never isPrivate', async () => {
    const { pool, query } = fakePool();
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('WITH ranked')) return { rows: [{ ...TRIP, created_at_raw: '2026-10-01 00:00:00+00', favorite_count: 0 }] };
      if (sql.includes('FROM planned_attractions')) return { rows: [{ ...PERSONAL, is_private: false }] };
      if (sql.includes('FROM trip_stops')) return { rows: [STOP] };
      return { rows: [] };
    });
    const page = await new PgTripRepository(pool).listFeed(null, 20);
    const a = page.items[0].stops[0].selectedAttractions[0];
    expect(a).toEqual({ activityType: 'lunch', title: 'Almuerzo', mapsUrl: 'https://maps.app.goo.gl/x', date: '01/10/2026', startTime: '13:00', endTime: '14:00' });
  });

  it('create() inserts personal fields and nulls them on catalog rows', async () => {
    const calls: unknown[][] = [];
    const client = { query: jest.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      if (sql.includes('INSERT INTO trips')) return { rows: [{ trip_id: 't1', created_at: new Date('2026-10-01T00:00:00Z') }] };
      if (sql.includes('INSERT INTO trip_stops')) return { rows: [{ stop_id: 'st1' }] };
      return { rows: [] };
    }), release: jest.fn() };
    const pool = { connect: jest.fn(async () => client), query: jest.fn(async () => ({ rows: [] })) } as unknown as Pool;
    await new PgTripRepository(pool).create({ ownerId: 'u1', title: 'T', stops: [{ cityId: 'paris', checkIn: '01/10/2026', checkOut: '03/10/2026',
      selectedAttractions: [
        { activityType: 'walk', title: 'Paseo', mapsUrl: 'https://maps.app.goo.gl/x', isPrivate: true, startTime: '10:00', endTime: '11:00' },
        { attractionId: 'paris_0', title: 'ignored', isPrivate: true, startTime: '12:00', endTime: '13:00' },
      ] }], transits: [] } as any);
    const inserts = calls.filter(c => (c[0] as string).includes('INSERT INTO planned_attractions'));
    expect(inserts[0][1]).toEqual(expect.arrayContaining(['walk', 'Paseo', 'https://maps.app.goo.gl/x', true]));
    expect(inserts[1][1]).toEqual(expect.arrayContaining(['paris_0']));
    expect(inserts[1][1]).not.toContain('ignored');
  });
});
