import { Pool } from 'pg';
import { IFollowRepository } from '../interfaces/follow.repository';

export class PgFollowRepository implements IFollowRepository {
  constructor(private readonly pool: Pool) {}

  async follow(followerId: string, followeeId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `INSERT INTO user_follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [followerId, followeeId],
    );
    return (rowCount ?? 0) > 0;
  }

  async unfollow(followerId: string, followeeId: string): Promise<void> {
    await this.pool.query(`DELETE FROM user_follows WHERE follower_id = $1 AND followee_id = $2`, [followerId, followeeId]);
  }

  async isFollowing(followerId: string, followeeId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 AS x FROM user_follows WHERE follower_id = $1 AND followee_id = $2`, [followerId, followeeId]);
    return rows.length > 0;
  }

  async counts(userId: string): Promise<{ followerCount: number; followingCount: number }> {
    const { rows: [r] } = await this.pool.query(
      `SELECT (SELECT COUNT(*)::int FROM user_follows WHERE followee_id = $1) AS follower_count,
              (SELECT COUNT(*)::int FROM user_follows WHERE follower_id = $1) AS following_count`,
      [userId],
    );
    return { followerCount: r.follower_count as number, followingCount: r.following_count as number };
  }

  async markNotified(followerId: string, followeeId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `INSERT INTO follow_notifications_sent (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [followerId, followeeId],
    );
    return (rowCount ?? 0) > 0;
  }
}
