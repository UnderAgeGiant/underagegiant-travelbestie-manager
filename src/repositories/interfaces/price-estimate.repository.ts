export interface IPriceEstimateRepository {
  /** Cached USD prices for keys written within the last maxAgeDays. Missing keys are absent from the map. */
  findFresh(keys: string[], maxAgeDays: number): Promise<Map<string, number>>;
  /** Insert or refresh (resets created_at). Empty input is a no-op. */
  upsertMany(rows: Array<{ key: string; priceUsd: number }>): Promise<void>;
}
