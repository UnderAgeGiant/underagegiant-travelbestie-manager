import type { Pool } from 'pg';
import { PgTrophyRepository } from '../src/repositories/pg/pg-trophy.repository';

function fakePool(result: { rows?: object[]; rowCount?: number }) {
  const query = jest.fn(async () => ({ rows: result.rows ?? [], rowCount: result.rowCount ?? 0 }));
  return { pool: { query } as unknown as Pool, query };
}

describe('PgTrophyRepository', () => {
  it('addEvent returns true only when a row was inserted, passing null scope', async () => {
    const { pool, query } = fakePool({ rowCount: 1 });
    expect(await new PgTrophyRepository(pool).addEvent('u1', 'comments', 'c1')).toBe(true);
    expect((query.mock.calls[0] as any)[1]).toEqual(['u1', 'comments', 'c1', null]);
    const dup = fakePool({ rowCount: 0 });
    expect(await new PgTrophyRepository(dup.pool).addEvent('u1', 'comments', 'c1')).toBe(false);
  });

  it('countEvents passes the scope (or null) and returns the number', async () => {
    const { pool, query } = fakePool({ rows: [{ count: 7 }] });
    expect(await new PgTrophyRepository(pool).countEvents('u1', 'favorites', 't1')).toBe(7);
    expect((query.mock.calls[0] as any)[1]).toEqual(['u1', 'favorites', 't1']);
  });

  it('awardTiers maps returned rows to ISO earnedAt and skips the query for no tiers', async () => {
    const { pool, query } = fakePool({ rows: [{ type: 'ai_plans', tier: 'bronze', earnedAt: new Date('2026-10-01T10:00:00Z') }] });
    const repo = new PgTrophyRepository(pool);
    expect(await repo.awardTiers('u1', 'ai_plans', [])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
    expect(await repo.awardTiers('u1', 'ai_plans', ['bronze'])).toEqual([
      { type: 'ai_plans', tier: 'bronze', earnedAt: '2026-10-01T10:00:00.000Z' },
    ]);
    expect((query.mock.calls[0] as any)[1]).toEqual(['u1', 'ai_plans', ['bronze']]);
  });

  it('progress turns rows into a type → count map', async () => {
    const { pool } = fakePool({ rows: [{ type: 'favorites', count: 12 }, { type: 'comments', count: 3 }] });
    expect(await new PgTrophyRepository(pool).progress('u1')).toEqual({ favorites: 12, comments: 3 });
  });

  it('hasTrophy reflects whether a row exists', async () => {
    expect(await new PgTrophyRepository(fakePool({ rows: [{ x: 1 }] }).pool).hasTrophy('u1', 'plan_visited')).toBe(true);
    expect(await new PgTrophyRepository(fakePool({ rows: [] }).pool).hasTrophy('u1', 'plan_visited')).toBe(false);
  });
});
