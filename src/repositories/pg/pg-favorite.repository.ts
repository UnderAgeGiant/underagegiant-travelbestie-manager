import { Pool } from 'pg';
import { IFavoriteRepository } from '../interfaces/favorite.repository.interface';
import { FavoriteToggleResult, FavoritedTrip } from '../../types';

export class PgFavoriteRepository implements IFavoriteRepository {
  constructor(private readonly pool: Pool) {}

  async toggle(userId: string, tripId: string): Promise<FavoriteToggleResult> {
    const { rows } = await this.pool.query<{ favorited: boolean; favoriteCount: number }>(
      `WITH deleted AS (
         DELETE FROM trip_favorites
         WHERE user_id = $1 AND trip_id = $2
         RETURNING trip_id
       ),
       inserted AS (
         INSERT INTO trip_favorites (user_id, trip_id)
         SELECT $1, $2
         WHERE NOT EXISTS (SELECT 1 FROM deleted)
         ON CONFLICT DO NOTHING
         RETURNING trip_id
       ),
       base_count AS (
         SELECT COUNT(*)::int AS n FROM trip_favorites WHERE trip_id = $2
       )
       SELECT
         EXISTS (SELECT 1 FROM inserted)                        AS favorited,
         base_count.n
           + (SELECT COUNT(*)::int FROM inserted)
           - (SELECT COUNT(*)::int FROM deleted)                AS "favoriteCount"
       FROM base_count`,
      [userId, tripId],
    );

    return rows[0];
  }

  async list(userId: string): Promise<FavoritedTrip[]> {
    const { rows } = await this.pool.query(
      `SELECT
         t.share_id             AS "id",
         t.share_id             AS "shareId",
         t.trip_id              AS "tripId",
         t.trip_id              AS "planId",
         t.title                AS "tripName",
         u.name                 AS "ownerName",
         u.email                AS "ownerEmail",
         t.created_at           AS "createdAt",
         tf.created_at          AS "favoritedAt",
         (SELECT COUNT(*) FROM trip_favorites f2 WHERE f2.trip_id = t.trip_id)::int AS "favoriteCount"
       FROM trip_favorites tf
       JOIN trips t ON t.trip_id = tf.trip_id
       JOIN users u ON u.user_id = t.owner_id
       WHERE tf.user_id = $1
       ORDER BY tf.created_at DESC`,
      [userId],
    );

    return rows.map(r => ({
      ...r,
      isFavoritedByMe: true,
      stops:           [],
      transits:        [],
      createdAt:       r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      favoritedAt:     r.favoritedAt instanceof Date ? r.favoritedAt.toISOString() : r.favoritedAt,
    }));
  }

  async getCountAndStatus(
    tripId: string,
    userId: string | null,
  ): Promise<{ favoriteCount: number; isFavoritedByMe: boolean }> {
    const { rows } = await this.pool.query(
      `SELECT
         COUNT(*)::int                                                AS "favoriteCount",
         BOOL_OR(user_id = $2::uuid)                                 AS "isFavoritedByMe"
       FROM trip_favorites
       WHERE trip_id = $1`,
      [tripId, userId],
    );

    return {
      favoriteCount:   rows[0].favoriteCount  ?? 0,
      isFavoritedByMe: rows[0].isFavoritedByMe ?? false,
    };
  }
}
