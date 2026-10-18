import type { Pool } from 'pg';
import { PgGameRepository } from '../src/repositories/pg/pg-game.repository';

function fakePool(upsertRows: object[], selectRows: object[] = []) {
  const query = jest.fn(async (sql: string, _params?: unknown[]) => ({ rows: sql.includes('INSERT INTO game_scores') ? upsertRows : selectRows }));
  return { pool: { query } as unknown as Pool, query };
}

describe('PgGameRepository.saveBest', () => {
  it('reports a new record when the upsert returns a row', async () => {
    const { pool, query } = fakePool([{ best_score: 1200 }]);
    expect(await new PgGameRepository(pool).saveBest('u1', '2026-10-12', 1200))
      .toEqual({ score: 1200, weeklyBest: 1200, newRecord: true, weekStart: '2026-10-12' });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/ON CONFLICT \(user_id, week_start\) DO UPDATE/);
    expect(sql).toMatch(/WHERE game_scores\.best_score < EXCLUDED\.best_score/);
    expect(params).toEqual(['u1', '2026-10-12', 1200]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing best when the new score is not higher', async () => {
    const { pool, query } = fakePool([], [{ best_score: 1890 }]);
    expect(await new PgGameRepository(pool).saveBest('u1', '2026-10-12', 1234))
      .toEqual({ score: 1234, weeklyBest: 1890, newRecord: false, weekStart: '2026-10-12' });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toEqual(['u1', '2026-10-12']);
  });
});
