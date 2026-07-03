import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: `${process.env.POSTGRES_URL_NO_SSL}?channel_binding=require&sslmode=verify-full`,
  // PgBouncer multiplexes client connections onto few Postgres backends, so a small
  // client pool is safe and avoids serializing concurrent requests (e.g. /stats + /featured).
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
