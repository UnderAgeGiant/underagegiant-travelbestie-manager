import { Pool } from 'pg';
import { IKarmaRepository } from '../interfaces/karma.repository';
import { Karma } from '../../types';

function insufficientKarmaError(have: number, need: number): Error & { status: number } {
  const err = new Error(`Insufficient karma: need ${need}, have ${have}`) as Error & { status: number };
  err.status = 402;
  return err;
}

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
    return this.spendAmount(userId, 1, 'itinerary_exported', refId);
  }

  async spendAmount(userId: string, amount: number, reason: string, refId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [row] } = await client.query<{ karma: number }>(
        `SELECT karma FROM users WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      const current = row?.karma ?? 0;
      if (current < amount) throw insufficientKarmaError(current, amount);
      await client.query(
        `UPDATE users SET karma = karma - $2, updated_at = now() WHERE user_id = $1`,
        [userId, amount],
      );
      await client.query(
        `INSERT INTO karma_events (user_id, delta, reason, ref_id) VALUES ($1, $2, $3, $4)`,
        [userId, -amount, reason, refId],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async award(userId: string, amount: number, reason: string, refId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE users SET karma = karma + $1 WHERE user_id = $2`,
        [amount, userId],
      );
      await client.query(
        `INSERT INTO karma_events (user_id, delta, reason, ref_id) VALUES ($1, $2, $3, $4)`,
        [userId, amount, reason, refId],
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
