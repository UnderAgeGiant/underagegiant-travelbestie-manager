import { Pool } from 'pg';
import { IKarmaRepository } from '../interfaces/karma.repository';
import { Karma } from '../../types';

export class PgKarmaRepository implements IKarmaRepository {
  constructor(private readonly pool: Pool) {}

  async get(email: string): Promise<Karma> {
    const { rows: [row] } = await this.pool.query(
      `SELECT karma FROM users WHERE email = LOWER($1)`,
      [email],
    );
    return { email, score: (row?.karma as number) ?? 0 };
  }

  async spend(userId: string, refId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE users SET karma = karma - 1, updated_at = now() WHERE user_id = $1`,
        [userId],
      );
      await client.query(
        `INSERT INTO karma_events (user_id, delta, reason, ref_id) VALUES ($1, -1, 'itinerary_exported', $2)`,
        [userId, refId],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
