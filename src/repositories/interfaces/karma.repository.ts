import { Karma, KarmaEventRow } from '../../types';
import { KarmaEventsCursor } from '../../lib/karma-events-cursor';

export interface IKarmaRepository {
  get(email: string): Promise<Karma>;
  spend(userId: string, refId: string): Promise<void>;
  spendAmount(userId: string, amount: number, reason: string, refId: string): Promise<void>;
  award(userId: string, amount: number, reason: string, refId: string): Promise<void>;
  /** Newest-first, keyset-paginated full ledger for one user. Fetches limit+1
   *  internally to determine hasMore without a second round trip. */
  listEvents(userId: string, cursor: KarmaEventsCursor | null, limit: number): Promise<{ rows: KarmaEventRow[]; hasMore: boolean }>;
}
