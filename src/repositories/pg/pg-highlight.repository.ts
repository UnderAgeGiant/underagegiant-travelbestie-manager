import { Pool } from 'pg';
import { IHighlightRepository } from '../interfaces/highlight.repository.interface';

export class PgHighlightRepository implements IHighlightRepository {
  constructor(private readonly pool: Pool) {}

  async hasSeen(userId: string, highlightType: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ seen: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM user_highlight_views
         WHERE user_id = $1 AND highlight_type = $2
       ) AS seen`,
      [userId, highlightType],
    );
    return rows[0]?.seen ?? false;
  }

  async markSeen(userId: string, highlightType: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_highlight_views (user_id, highlight_type, last_seen_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id, highlight_type)
       DO UPDATE SET last_seen_at = now()`,
      [userId, highlightType],
    );
  }
}
