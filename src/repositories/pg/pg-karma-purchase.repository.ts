import { Pool } from 'pg';
import { IKarmaPurchaseRepository } from '../interfaces/karma-purchase.repository';
import { KarmaPurchase, CompleteKarmaPurchaseResult } from '../../types';

function rowToPurchase(row: Record<string, unknown>): KarmaPurchase {
  return {
    purchaseId:       row.purchase_id as string,
    userId:           row.user_id as string,
    provider:         row.provider as string,
    providerOrderId:  row.provider_order_id as string,
    providerCaptureId:(row.provider_capture_id as string | null) ?? null,
    packageId:        row.package_id as string,
    karmaAmount:      row.karma_amount as number,
    amount:           String(row.amount),
    currency:         row.currency as string,
    status:           row.status as KarmaPurchase['status'],
    createdAt:        (row.created_at as Date).toISOString(),
    completedAt:      row.completed_at ? (row.completed_at as Date).toISOString() : null,
  };
}

export class PgKarmaPurchaseRepository implements IKarmaPurchaseRepository {
  constructor(private readonly pool: Pool) {}

  async createPurchaseIntent(
    userId: string,
    provider: string,
    providerOrderId: string,
    packageId: string,
    karmaAmount: number,
    amount: string,
    currency: string,
  ): Promise<KarmaPurchase> {
    const { rows: [row] } = await this.pool.query(
      `INSERT INTO karma_purchases
         (user_id, provider, provider_order_id, package_id, karma_amount, amount, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, provider, providerOrderId, packageId, karmaAmount, amount, currency],
    );
    return rowToPurchase(row);
  }

  async findByOrderId(providerOrderId: string): Promise<KarmaPurchase | null> {
    const { rows: [row] } = await this.pool.query(
      `SELECT * FROM karma_purchases WHERE provider_order_id = $1`,
      [providerOrderId],
    );
    return row ? rowToPurchase(row) : null;
  }

  async completePurchase(
    providerOrderId: string,
    captureId: string,
  ): Promise<CompleteKarmaPurchaseResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Mark purchase as completed
      const { rows: [purchaseRow] } = await client.query(
        `UPDATE karma_purchases
         SET status = 'completed', provider_capture_id = $2, completed_at = now()
         WHERE provider_order_id = $1
         RETURNING *`,
        [providerOrderId, captureId],
      );
      const purchase = rowToPurchase(purchaseRow);

      // 2. Credit karma and get new total
      const { rows: [userRow] } = await client.query<{ karma: number }>(
        `UPDATE users SET karma = karma + $2, updated_at = now()
         WHERE user_id = $1
         RETURNING karma`,
        [purchase.userId, purchase.karmaAmount],
      );
      const newKarmaTotal = userRow.karma;

      // 3. Audit log
      await client.query(
        `INSERT INTO karma_events (user_id, delta, reason, ref_id)
         VALUES ($1, $2, 'karma_purchased', $3)`,
        [purchase.userId, purchase.karmaAmount, purchase.purchaseId],
      );

      await client.query('COMMIT');
      return { purchase, newKarmaTotal };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async failPurchase(providerOrderId: string): Promise<void> {
    await this.pool.query(
      `UPDATE karma_purchases SET status = 'failed' WHERE provider_order_id = $1`,
      [providerOrderId],
    );
  }
}
