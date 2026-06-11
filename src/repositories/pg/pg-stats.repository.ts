import { Pool } from 'pg';
import { redis } from '../../lib/redis';
import { IStatsRepository } from '../interfaces/stats.repository';
import { AppStats } from '../../types';

const CACHE_KEY = 'stats:global';
const CACHE_TTL = 3600; // 1 hour

export class PgStatsRepository implements IStatsRepository {
  constructor(private readonly pool: Pool) {}

  async get(): Promise<AppStats> {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return JSON.parse(cached) as AppStats;
    } catch { /* non-fatal — fall through to DB */ }

    const { rows: [row] } = await this.pool.query<{ cities: string; users: string; plans: string }>(`
      SELECT
        (SELECT COUNT(DISTINCT city_id)::int FROM trip_stops)  AS cities,
        (SELECT COUNT(*)::int FROM users)                      AS users,
        (SELECT COUNT(*)::int FROM trips)                      AS plans
    `);

    const result: AppStats = {
      cities: Number(row.cities),
      users:  Number(row.users),
      plans:  Number(row.plans),
    };

    try {
      await redis.set(CACHE_KEY, JSON.stringify(result), 'EX', CACHE_TTL);
    } catch { /* non-fatal */ }

    return result;
  }
}
