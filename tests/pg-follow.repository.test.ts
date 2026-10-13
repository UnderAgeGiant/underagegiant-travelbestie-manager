import type { Pool } from 'pg';
import { PgFollowRepository } from '../src/repositories/pg/pg-follow.repository';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function fakePool(result: { rows?: object[]; rowCount?: number }) {
  const query = jest.fn(async (_sql: string, _p?: unknown[]) => ({ rows: result.rows ?? [], rowCount: result.rowCount ?? 0 }));
  return { pool: { query } as unknown as Pool, query };
}

describe('PgFollowRepository', () => {
  it('follow inserts idempotently and reports whether it was new', async () => {
    const { pool, query } = fakePool({ rowCount: 1 });
    expect(await new PgFollowRepository(pool).follow(A, B)).toBe(true);
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT DO NOTHING');
    expect(query.mock.calls[0][1]).toEqual([A, B]);
    const again = fakePool({ rowCount: 0 });
    expect(await new PgFollowRepository(again.pool).follow(A, B)).toBe(false);
  });

  it('unfollow deletes by pair', async () => {
    const { pool, query } = fakePool({});
    await new PgFollowRepository(pool).unfollow(A, B);
    expect(query.mock.calls[0][0]).toContain('DELETE FROM user_follows');
    expect(query.mock.calls[0][1]).toEqual([A, B]);
  });

  it('counts maps both numbers', async () => {
    const { pool } = fakePool({ rows: [{ follower_count: 3, following_count: 1 }] });
    expect(await new PgFollowRepository(pool).counts(A)).toEqual({ followerCount: 3, followingCount: 1 });
  });

  it('markNotified is true only when a row was inserted', async () => {
    expect(await new PgFollowRepository(fakePool({ rowCount: 1 }).pool).markNotified(A, B)).toBe(true);
    expect(await new PgFollowRepository(fakePool({ rowCount: 0 }).pool).markNotified(A, B)).toBe(false);
  });

  it('isFollowing', async () => {
    expect(await new PgFollowRepository(fakePool({ rows: [{ x: 1 }] }).pool).isFollowing(A, B)).toBe(true);
    expect(await new PgFollowRepository(fakePool({ rows: [] }).pool).isFollowing(A, B)).toBe(false);
  });
});
