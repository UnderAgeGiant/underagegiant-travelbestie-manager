import { Pool } from 'pg';
import { redis } from '../../lib/redis';
import { RANKINGS_CACHE_TTL, RANKINGS_TOP_N, RANKINGS_TZ, myRankingsKey, rankingsKey } from '../../lib/rankings';
import { IRankingRepository } from '../interfaces/ranking.repository';
import { MyRank, MyRankings, RankedCity, RankedPlan, RankedUser, WeeklyRankings } from '../../types';

// $1 = week start date (Monday, Santiago) → that Monday 00:00 in Santiago as timestamptz.
const WEEK_START = `(($1::date)::timestamp AT TIME ZONE '${RANKINGS_TZ}')`;

// Ties: value DESC, then whoever got there first. Value-0 rows never exist (GROUP BY of matching rows).
const SQL_PLANNERS = `/*planners*/
  SELECT u.name, COUNT(*)::int AS value
    FROM trips t JOIN users u ON u.user_id = t.owner_id
   WHERE t.created_at >= ${WEEK_START}
   GROUP BY u.user_id, u.name
   ORDER BY value DESC, MIN(t.created_at) ASC
   LIMIT $2`;

const SQL_DESTINATIONS = `/*destinations*/
  SELECT s.city_id AS "cityId", COUNT(*)::int AS value
    FROM trip_stops s JOIN trips t ON t.trip_id = s.trip_id
   WHERE t.created_at >= ${WEEK_START}
   GROUP BY s.city_id
   ORDER BY value DESC, MIN(t.created_at) ASC
   LIMIT $2`;

const SQL_TROPHIES = `/*trophies*/
  SELECT u.name, COUNT(*)::int AS value
    FROM user_trophies ut JOIN users u ON u.user_id = ut.user_id
   WHERE ut.earned_at >= ${WEEK_START}
   GROUP BY u.user_id, u.name
   ORDER BY value DESC, MIN(ut.earned_at) ASC
   LIMIT $2`;

const SQL_FAVORITED = `/*favorited*/
  SELECT t.title, t.share_id AS "shareId", u.name AS "ownerName", COUNT(*)::int AS value
    FROM trip_favorites f
    JOIN trips t ON t.trip_id = f.trip_id
    JOIN users u ON u.user_id = t.owner_id
   WHERE f.created_at >= ${WEEK_START} AND t.share_id IS NOT NULL
   GROUP BY t.trip_id, t.title, t.share_id, u.name
   ORDER BY value DESC, MIN(f.created_at) ASC
   LIMIT $2`;

// "me" queries: $1 = week start, $2 = userId. counts = one row per entity; m = the viewer's row.
const meSql = (marker: string, counts: string, mine: string): string => `/*${marker}*/
  WITH counts AS (${counts})
  SELECT (SELECT COUNT(*)::int FROM counts o WHERE o.value > m.value) + 1 AS rank, m.value
    FROM counts m WHERE ${mine}
   ORDER BY m.value DESC
   LIMIT 1`;

const SQL_ME_PLANNERS = meSql('me-planners',
  `SELECT owner_id AS id, COUNT(*)::int AS value FROM trips WHERE created_at >= ${WEEK_START} GROUP BY owner_id`,
  `m.id = $2::uuid`);

const SQL_ME_TROPHIES = meSql('me-trophies',
  `SELECT user_id AS id, COUNT(*)::int AS value FROM user_trophies WHERE earned_at >= ${WEEK_START} GROUP BY user_id`,
  `m.id = $2::uuid`);

const SQL_ME_FAVORITED = meSql('me-favorited',
  `SELECT t.owner_id AS id, COUNT(*)::int AS value
     FROM trip_favorites f JOIN trips t ON t.trip_id = f.trip_id
    WHERE f.created_at >= ${WEEK_START} AND t.share_id IS NOT NULL
    GROUP BY t.trip_id, t.owner_id`,
  `m.id = $2::uuid`); // best of the viewer's plans via ORDER BY value DESC LIMIT 1

async function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch { /* non-fatal — fall through to DB */ }
  const value = await compute();
  try {
    await redis.set(key, JSON.stringify(value), 'EX', RANKINGS_CACHE_TTL);
  } catch { /* non-fatal */ }
  return value;
}

export class PgRankingRepository implements IRankingRepository {
  constructor(private readonly pool: Pool) {}

  getWeekly(weekStart: string): Promise<WeeklyRankings> {
    return cached(rankingsKey(weekStart), async () => {
      const p = [weekStart, RANKINGS_TOP_N];
      const [planners, destinations, trophies, favorited] = await Promise.all([
        this.pool.query<RankedUser>(SQL_PLANNERS, p),
        this.pool.query<RankedCity>(SQL_DESTINATIONS, p),
        this.pool.query<RankedUser>(SQL_TROPHIES, p),
        this.pool.query<RankedPlan>(SQL_FAVORITED, p),
      ]);
      return {
        weekStart,
        generatedAt: new Date().toISOString(),
        topPlanners: planners.rows,
        topDestinations: destinations.rows,
        topTrophies: trophies.rows,
        topFavorited: favorited.rows,
      };
    });
  }

  getMine(weekStart: string, userId: string): Promise<MyRankings> {
    return cached(myRankingsKey(weekStart, userId), async () => {
      const p = [weekStart, userId];
      const one = async (sql: string): Promise<MyRank | null> => {
        const { rows } = await this.pool.query<MyRank>(sql, p);
        return rows[0] ? { rank: rows[0].rank, value: rows[0].value } : null;
      };
      const [planners, trophies, favorited] = await Promise.all([
        one(SQL_ME_PLANNERS), one(SQL_ME_TROPHIES), one(SQL_ME_FAVORITED),
      ]);
      return { weekStart, planners, trophies, favorited };
    });
  }
}
