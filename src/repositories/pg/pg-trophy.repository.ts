import { Pool } from 'pg';
import { ITrophyRepository } from '../interfaces/trophy.repository';
import { EarnedTrophy, TrophyTier, TrophyType } from '../../types';

const toIso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const mapEarned = (r: { type: TrophyType; tier: TrophyTier; earnedAt: unknown }): EarnedTrophy =>
  ({ type: r.type, tier: r.tier, earnedAt: toIso(r.earnedAt) });

export class PgTrophyRepository implements ITrophyRepository {
  constructor(private readonly pool: Pool) {}

  async addEvent(userId: string, type: TrophyType, refId: string, scopeId?: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `INSERT INTO trophy_events (user_id, trophy_type, ref_id, scope_id)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [userId, type, refId, scopeId ?? null],
    );
    return rowCount === 1;
  }

  async countEvents(userId: string, type: TrophyType, scopeId?: string): Promise<number> {
    const { rows: [row] } = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM trophy_events
       WHERE user_id = $1 AND trophy_type = $2 AND ($3::text IS NULL OR scope_id = $3)`,
      [userId, type, scopeId ?? null],
    );
    return row.count as number;
  }

  async awardTiers(userId: string, type: TrophyType, tiers: TrophyTier[]): Promise<EarnedTrophy[]> {
    if (!tiers.length) return [];
    const { rows } = await this.pool.query(
      `INSERT INTO user_trophies (user_id, trophy_type, tier)
       SELECT $1, $2, unnest($3::text[])
       ON CONFLICT DO NOTHING
       RETURNING trophy_type AS type, tier, earned_at AS "earnedAt"`,
      [userId, type, tiers],
    );
    return rows.map(mapEarned);
  }

  async hasTrophy(userId: string, type: TrophyType): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM user_trophies WHERE user_id = $1 AND trophy_type = $2 LIMIT 1`,
      [userId, type],
    );
    return rows.length > 0;
  }

  async listEarned(userId: string): Promise<EarnedTrophy[]> {
    const { rows } = await this.pool.query(
      `SELECT trophy_type AS type, tier, earned_at AS "earnedAt"
       FROM user_trophies WHERE user_id = $1 ORDER BY earned_at DESC`,
      [userId],
    );
    return rows.map(mapEarned);
  }

  async progress(userId: string): Promise<Partial<Record<TrophyType, number>>> {
    // Unscoped types have one NULL-scope group, so MAX over groups == total; favorites get max per plan.
    const { rows } = await this.pool.query(
      `SELECT trophy_type AS type, MAX(n)::int AS count
       FROM (SELECT trophy_type, scope_id, COUNT(*) AS n
             FROM trophy_events WHERE user_id = $1
             GROUP BY trophy_type, scope_id) s
       GROUP BY trophy_type`,
      [userId],
    );
    return Object.fromEntries(rows.map(r => [r.type, r.count]));
  }

  async listEarnedSince(userId: string, type: TrophyType, sinceIso: string): Promise<EarnedTrophy[]> {
    const { rows } = await this.pool.query(
      `SELECT trophy_type AS type, tier, earned_at AS "earnedAt"
       FROM user_trophies WHERE user_id = $1 AND trophy_type = $2 AND earned_at >= $3`,
      [userId, type, sinceIso],
    );
    return rows.map(mapEarned);
  }
}
