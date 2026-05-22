import { Karma } from '../../types';

export interface IKarmaRepository {
  get(email: string): Promise<Karma>;
  spend(userId: string, refId: string): Promise<void>;
  spendAmount(userId: string, amount: number, reason: string, refId: string): Promise<void>;
}
