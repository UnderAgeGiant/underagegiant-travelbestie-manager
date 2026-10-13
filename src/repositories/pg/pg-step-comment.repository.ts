import { Pool } from 'pg';
import { IStepCommentRepository } from '../interfaces/step-comment.repository';
import { StepComment, StepCommentsMap } from '../../types';

export class PgStepCommentRepository implements IStepCommentRepository {
  constructor(private readonly pool: Pool) {}

  async getAllForTrip(tripId: string): Promise<StepCommentsMap> {
    const { rows } = await this.pool.query(
      `SELECT sc.id, sc.step_key, sc.author_name, u.username AS author_username, sc.text, sc.created_at
       FROM step_comments sc LEFT JOIN users u ON u.user_id = sc.user_id
       WHERE sc.trip_id = $1 ORDER BY sc.created_at ASC`,
      [tripId],
    );
    const map: StepCommentsMap = {};
    for (const r of rows) {
      const key = r.step_key as string;
      if (!map[key]) map[key] = [];
      map[key].push({
        id:         r.id          as string,
        stepKey:    key,
        authorName: r.author_name as string,
        authorUsername: (r.author_username as string | null) ?? null,
        text:       r.text        as string,
        createdAt:  (r.created_at as Date).toISOString(),
      });
    }
    return map;
  }

  async add(data: {
    tripId: string; stepKey: string;
    userId: string; authorName: string; text: string;
  }): Promise<StepComment> {
    const { rows: [row] } = await this.pool.query(
      `INSERT INTO step_comments (trip_id, step_key, user_id, author_name, text)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, step_key, author_name, text, created_at, (SELECT username FROM users WHERE user_id = $3) AS author_username`,
      [data.tripId, data.stepKey, data.userId, data.authorName, data.text],
    );
    return {
      id:         row.id          as string,
      stepKey:    row.step_key    as string,
      authorName: row.author_name as string,
      authorUsername: (row.author_username as string | null) ?? null,
      text:       row.text        as string,
      createdAt:  (row.created_at as Date).toISOString(),
    };
  }

  async isFirstCommentOnStep(userId: string, tripId: string, stepKey: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `INSERT INTO step_comment_karma (user_id, trip_id, step_key)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [userId, tripId, stepKey],
    );
    return (rowCount ?? 0) > 0;
  }
}
