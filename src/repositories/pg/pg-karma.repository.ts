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
}
