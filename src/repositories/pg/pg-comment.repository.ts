import { Pool } from 'pg';
import { ICommentRepository } from '../interfaces/comment.repository';
import { Comment } from '../../types';

export class PgCommentRepository implements ICommentRepository {
  constructor(private readonly pool: Pool) {}

  async add(data: Omit<Comment, 'id' | 'createdAt'> & { userId: string }): Promise<Comment> {
    const { rows: [row] } = await this.pool.query(
      `INSERT INTO attraction_comments (attraction_id, user_id, text, rating, color)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING comment_id, created_at`,
      [data.attractionId, data.userId, data.text, data.rating, data.color],
    );
    const createdAt = (row.created_at as Date).toISOString();
    return {
      id: row.comment_id as string,
      attractionId: data.attractionId,
      name: data.name,
      text: data.text,
      rating: data.rating,
      color: data.color,
      date: createdAt.slice(0, 10),
      createdAt,
    };
  }

  async findByAttraction(attractionId: string): Promise<Comment[]> {
    const { rows } = await this.pool.query(
      `SELECT ac.comment_id, ac.attraction_id, u.name, ac.text, ac.rating, ac.color, ac.created_at
       FROM attraction_comments ac
       JOIN users u ON u.user_id = ac.user_id
       WHERE ac.attraction_id = $1
       ORDER BY ac.created_at DESC`,
      [attractionId],
    );
    return rows.map(r => this.toComment(r));
  }

  async findByAttractions(ids: string[]): Promise<Record<string, Comment[]>> {
    const result: Record<string, Comment[]> = {};
    for (const id of ids) result[id] = [];

    if (ids.length === 0) return result;

    const { rows } = await this.pool.query(
      `SELECT ac.comment_id, ac.attraction_id, u.name, ac.text, ac.rating, ac.color, ac.created_at
       FROM attraction_comments ac
       JOIN users u ON u.user_id = ac.user_id
       WHERE ac.attraction_id = ANY($1::text[])
       ORDER BY ac.attraction_id, ac.created_at DESC`,
      [ids],
    );

    for (const r of rows) {
      result[r.attraction_id as string].push(this.toComment(r));
    }
    return result;
  }

  private toComment(r: Record<string, unknown>): Comment {
    const createdAt = (r.created_at as Date).toISOString();
    return {
      id: r.comment_id as string,
      attractionId: r.attraction_id as string,
      name: r.name as string,
      text: r.text as string,
      rating: r.rating as number,
      color: r.color as string,
      date: createdAt.slice(0, 10),
      createdAt,
    };
  }
}
