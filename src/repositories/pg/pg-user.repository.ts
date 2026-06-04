import { Pool } from 'pg';
import { IUserRepository } from '../interfaces/user.repository';
import { User } from '../../types';

const INITIAL_KARMA = 3;

export class PgUserRepository implements IUserRepository {
  constructor(private readonly pool: Pool) {}

  async create(data: { name: string; email: string; passwordHash: string }): Promise<User> {
    const { rows: [row] } = await this.pool.query(
      `INSERT INTO users (name, email, password_hash, karma)
       VALUES ($1, LOWER($2), $3, $4)
       RETURNING user_id, name, email, password_hash, created_at`,
      [data.name, data.email, data.passwordHash, INITIAL_KARMA],
    );
    return mapUser(row);
  }

  async findByEmail(email: string): Promise<User | null> {
    const { rows: [row] } = await this.pool.query(
      `SELECT user_id, name, email, password_hash, created_at
       FROM users WHERE email = LOWER($1)`,
      [email],
    );
    return row ? mapUser(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const { rows: [row] } = await this.pool.query(
      `SELECT user_id, name, email, password_hash, created_at
       FROM users WHERE user_id = $1`,
      [id],
    );
    return row ? mapUser(row) : null;
  }

  async update(userId: string, fields: { name?: string; email?: string; passwordHash?: string }): Promise<User> {
    const { rows: [row] } = await this.pool.query(
      `UPDATE users
       SET name          = COALESCE($2, name),
           email         = COALESCE($3, email),
           password_hash = COALESCE($4, password_hash)
       WHERE user_id = $1
       RETURNING user_id, name, email, password_hash, created_at`,
      [userId, fields.name ?? null, fields.email ?? null, fields.passwordHash ?? null],
    );
    if (!row) throw new Error('User not found');
    return mapUser(row);
  }
}

function mapUser(row: Record<string, unknown>): User {
  return {
    id: row.user_id as string,
    name: row.name as string,
    email: row.email as string,
    passwordHash: row.password_hash as string,
    createdAt: (row.created_at as Date).toISOString(),
  };
}
