import type { Pool } from 'pg';
import { PgTripRepository } from '../src/repositories/pg/pg-trip.repository';
import { decodeFeedCursor } from '../src/lib/feed-cursor';

const ME = '99999999-9999-4999-8999-999999999999';
const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const row = (tripId: string, shareId: string, raw: string) => ({
  trip_id: tripId, title: `Plan ${shareId}`, created_at: new Date('2026-10-01T10:00:00Z'), created_at_raw: raw,
  share_id: shareId, owner_name: 'Ana', owner_username: 'ana', favorite_count: 2,
});

function fakePool(main: object[]) {
  const query = jest.fn(async (sql: string, _p?: unknown[]) => {
    if (sql.includes('/*social*/')) return { rows: main };
    return { rows: [] };
  });
  return { pool: { query } as unknown as Pool, query };
}

describe('PgTripRepository social reads', () => {
  it('listFollowingFeed filters by follower, pages on (created_at, trip_id), maps ownerUsername', async () => {
    const { pool, query } = fakePool([row(T1, 's1', '2026-10-01 10:00:00.2+00'), row(T2, 's2', '2026-10-01 10:00:00.1+00')]);
    const page = await new PgTripRepository(pool).listFollowingFeed(ME, null, 1);
    expect(query.mock.calls[0][0]).toContain('user_follows');
    expect(query.mock.calls[0][1]).toEqual([ME, null, null, 2]);
    expect(page.items).toEqual([expect.objectContaining({ id: 's1', ownerUsername: 'ana', favoriteCount: 2 })]);
    expect(decodeFeedCursor(page.nextCursor!)).toEqual({ favoriteCount: 0, createdAt: '2026-10-01 10:00:00.2+00', tripId: T1 });
  });

  it('listFollowingFeed passes the cursor through', async () => {
    const { pool, query } = fakePool([]);
    await new PgTripRepository(pool).listFollowingFeed(ME, { favoriteCount: 0, createdAt: '2026-10-01 10:00:00.2+00', tripId: T1 }, 20);
    expect(query.mock.calls[0][1]).toEqual([ME, '2026-10-01 10:00:00.2+00', T1, 21]);
  });

  it('listSharedByOwner filters shared trips of one owner with a limit', async () => {
    const { pool, query } = fakePool([row(T1, 's1', 'x')]);
    const items = await new PgTripRepository(pool).listSharedByOwner(ME, 50);
    expect(query.mock.calls[0][0]).toContain('share_id IS NOT NULL');
    expect(query.mock.calls[0][1]).toEqual([ME, 50]);
    expect(items[0]).toMatchObject({ id: 's1', ownerUsername: 'ana' });
  });
});

describe('PgTripRepository owner username on shared payloads', () => {
  // Only the owner-joined share queries return a trip row; hydrate sub-queries get [].
  const sharedPool = (main: object[]) => {
    const query = jest.fn(async (sql: string, _p?: unknown[]) =>
      ({ rows: sql.includes('u.email AS owner_email') ? main : [] }));
    return { pool: { query } as unknown as Pool, query };
  };
  const sharedRow = {
    trip_id: T1, title: 'Europa', owner_id: ME, created_at: new Date('2026-10-01T10:00:00Z'),
    share_id: 's1', owner_email: 'a@x.test', owner_name: 'Ana', owner_username: 'ana', favorite_count: 2,
  };

  it('findManyByShareIds selects u.username and maps ownerUsername', async () => {
    const { pool, query } = sharedPool([sharedRow]);
    const [p] = await new PgTripRepository(pool).findManyByShareIds(['s1']);
    expect(query.mock.calls[0][0]).toContain('u.username AS owner_username');
    expect(p).toMatchObject({ id: 's1', ownerUsername: 'ana' });
  });

  it('searchShared selects u.username and maps ownerUsername', async () => {
    const { pool, query } = sharedPool([sharedRow]);
    const [p] = await new PgTripRepository(pool).searchShared('Europa');
    expect(query.mock.calls[0][0]).toContain('u.username AS owner_username');
    expect(p).toMatchObject({ id: 's1', ownerUsername: 'ana' });
  });

  it('maps a null username to ownerUsername: null', async () => {
    const { pool } = sharedPool([{ ...sharedRow, owner_username: null }]);
    const [p] = await new PgTripRepository(pool).findManyByShareIds(['s1']);
    expect(p.ownerUsername).toBeNull();
  });
});
