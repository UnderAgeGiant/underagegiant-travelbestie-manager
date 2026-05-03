import { Pool } from 'pg';

export const pool = new Pool({ connectionString: `${process.env.POSTGRES_URL_NO_SSL}?channel_binding=require&sslmode=verify-full` });
