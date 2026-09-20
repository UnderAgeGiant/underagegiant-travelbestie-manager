import type { Pool } from 'pg';
import { PgTripRepository } from '../src/repositories/pg/pg-trip.repository';
import { decodeFeedCursor } from '../src/lib/feed-cursor';

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const T3 = '33333333-3333-4333-8333-333333333333';

const feedRow = (tripId: string, shareId: string, fav: number, raw: string) => ({
  trip_id: tripId, title: `Plan ${shareId}`, created_at: new Date('2026-09-01T10:00:00.123Z'),
  created_at_raw: raw, share_id: shareId, owner_name: 'Ana', favorite_count: fav,
});

function fakePool(feedRows: Record<string, unknown>[], extra: { stops?: object[]; attractions?: object[] } = {}) {
  const query = jest.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('WITH ranked'))              return { rows: feedRows };
    if (sql.includes('FROM trip_stops'))          return { rows: extra.stops ?? [] };
    if (sql.includes('FROM planned_attractions')) return { rows: extra.attractions ?? [] };
    return { rows: [] };
  });
  return { pool: { query } as unknown as Pool, query };
}

describe('PgTripRepository.listFeed', () => {
  it('passes null cursor params and limit+1 on the first page', async () => {
    const { pool, query } = fakePool([]);
    await new PgTripRepository(pool).listFeed(null, 20);
    expect(query.mock.calls[0][1]).toEqual([null, null, null, 21]);
  });

  it('passes the cursor fields through in (favoriteCount, createdAt, tripId, limit+1) order', async () => {
    const { pool, query } = fakePool([]);
    await new PgTripRepository(pool).listFeed({ favoriteCount: 3, createdAt: '2026-09-01 10:00:00.123456+00', tripId: T1 }, 5);
    expect(query.mock.calls[0][1]).toEqual([3, '2026-09-01 10:00:00.123456+00', T1, 6]);
  });

  it('trims the extra row and builds nextCursor from the LAST RETURNED row with full-precision createdAt', async () => {
    const rows = [
      feedRow(T1, 's1', 5, '2026-09-01 10:00:00.111111+00'),
      feedRow(T2, 's2', 4, '2026-09-01 10:00:00.222222+00'),
      feedRow(T3, 's3', 3, '2026-09-01 10:00:00.333333+00'), // the "+1" probe row
    ];
    const { pool } = fakePool(rows);
    const page = await new PgTripRepository(pool).listFeed(null, 2);
    expect(page.items.map(i => i.id)).toEqual(['s1', 's2']);
    expect(decodeFeedCursor(page.nextCursor!)).toEqual({ favoriteCount: 4, createdAt: '2026-09-01 10:00:00.222222+00', tripId: T2 });
  });

  it('returns nextCursor null when the page is not full', async () => {
    const { pool } = fakePool([feedRow(T1, 's1', 1, '2026-09-01 10:00:00.1+00')]);
    const page = await new PgTripRepository(pool).listFeed(null, 20);
    expect(page.nextCursor).toBeNull();
  });

  it('maps only the public feed fields (no owner email/id, transits, lodging, planId)', async () => {
    const { pool } = fakePool([feedRow(T1, 's1', 2, '2026-09-01 10:00:00.1+00')], {
      stops: [{ stop_id: 'st1', trip_id: T1, city_id: 'rome', check_in: '2026-06-01', check_out: '2026-06-05' }],
      attractions: [{ stop_id: 'st1', attraction_id: 'rome_0', start_time: '09:00:00', end_time: null, date: '2026-06-02', category: 'poi', ticket_purchased: false }],
    });
    const [item] = (await new PgTripRepository(pool).listFeed(null, 20)).items;
    expect(Object.keys(item).sort()).toEqual(['createdAt', 'favoriteCount', 'id', 'ownerName', 'stops', 'tripName']);
    expect(item.stops).toEqual([{
      cityId: 'rome', checkIn: '01/06/2026', checkOut: '05/06/2026',
      selectedAttractions: [{ attractionId: 'rome_0', date: '02/06/2026', startTime: '09:00', endTime: null }],
    }]);
    expect(item.createdAt).toBe('2026-09-01T10:00:00.123Z');
  });

  it('uses the total sort order and never selects owner identity columns', async () => {
    const { pool, query } = fakePool([]);
    await new PgTripRepository(pool).listFeed(null, 20);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('ORDER BY favorite_count DESC, created_at DESC, trip_id DESC');
    expect(sql).not.toContain('owner_email');
    expect(sql).not.toContain('u.email');
    // owner_id may only appear as the JOIN key — it must never be part of the select list.
    expect(sql.match(/owner_id/g)).toHaveLength(1);
    expect(sql).toContain('ON u.user_id = t.owner_id');
  });
});
