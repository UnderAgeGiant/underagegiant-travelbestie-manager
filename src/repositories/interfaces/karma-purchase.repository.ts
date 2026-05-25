import { KarmaPurchase, CompleteKarmaPurchaseResult } from '../../types';

export interface IKarmaPurchaseRepository {
  createPurchaseIntent(
    userId: string,
    provider: string,
    providerOrderId: string,
    packageId: string,
    karmaAmount: number,
    amount: string,
    currency: string,
  ): Promise<KarmaPurchase>;

  findByOrderId(providerOrderId: string): Promise<KarmaPurchase | null>;

  completePurchase(
    providerOrderId: string,
    captureId: string,
  ): Promise<CompleteKarmaPurchaseResult>;

  failPurchase(providerOrderId: string): Promise<void>;
}
