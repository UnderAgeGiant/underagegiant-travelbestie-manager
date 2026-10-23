import { Pool } from 'pg';
import { IPriceEstimateRepository } from '../interfaces/price-estimate.repository';

export class PgPriceEstimateRepository implements IPriceEstimateRepository {
  constructor(private readonly pool: Pool) {}

  async findFresh(keys: string[], maxAgeDays: number): Promise<Map<string, number>> {
    if (keys.length === 0) return new Map();
    // NUMERIC comes back from pg as a string.
    const { rows } = await this.pool.query<{ cache_key: string; price_usd: string }>(
      `SELECT cache_key, price_usd FROM price_estimates
       WHERE cache_key = ANY($1) AND created_at > now() - make_interval(days => $2)`,
      [keys, maxAgeDays],
    );
    return new Map(rows.map(r => [r.cache_key, Number(r.price_usd)]));
  }

  async upsertMany(rows: Array<{ key: string; priceUsd: number }>): Promise<void> {
    if (rows.length === 0) return;
    const params: unknown[] = [];
    const tuples = rows.map((r, i) => {
      params.push(r.key, r.priceUsd);
      return `($${2 * i + 1}, $${2 * i + 2})`;
    });
    await this.pool.query(
      `INSERT INTO price_estimates (cache_key, price_usd) VALUES ${tuples.join(', ')}
       ON CONFLICT (cache_key) DO UPDATE SET price_usd = EXCLUDED.price_usd, created_at = now()`,
      params,
    );
  }
}
