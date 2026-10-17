import { Pool } from 'pg';
import { IGameRepository } from '../interfaces/game.repository';
import { FinishRunResponse } from '../../types';

const SQL_UPSERT = `
  INSERT INTO game_scores (user_id, week_start, best_score) VALUES ($1::uuid, $2::date, $3)
  ON CONFLICT (user_id, week_start) DO UPDATE SET best_score = EXCLUDED.best_score, best_at = now()
   WHERE game_scores.best_score < EXCLUDED.best_score
  RETURNING best_score`;

const SQL_BEST = `SELECT best_score FROM game_scores WHERE user_id = $1::uuid AND week_start = $2::date`;

export class PgGameRepository implements IGameRepository {
  constructor(private readonly pool: Pool) {}

  async saveBest(userId: string, weekStart: string, score: number): Promise<FinishRunResponse> {
    const up = await this.pool.query<{ best_score: number }>(SQL_UPSERT, [userId, weekStart, score]);
    if (up.rows[0]) return { score, weeklyBest: up.rows[0].best_score, newRecord: true, weekStart };
    const cur = await this.pool.query<{ best_score: number }>(SQL_BEST, [userId, weekStart]);
    return { score, weeklyBest: cur.rows[0]?.best_score ?? score, newRecord: false, weekStart };
  }
}
