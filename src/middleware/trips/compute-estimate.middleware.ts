import { Request, Response, NextFunction } from 'express';
import { DEFAULT_COST_SETTINGS, estimateInputsHash, planPricing } from '../../lib/trip-cost';
import { PriceRedis, resolvePrices } from '../../lib/price-fetcher';
import type { IPriceEstimateRepository } from '../../repositories/interfaces/price-estimate.repository';
import type { CostEstimate } from '../../types';

/** Recomputes the trip's cost estimate into req.result (not stored here; saveEstimate persists it). */
export function makeComputeEstimate(priceRepo: IPriceEstimateRepository | undefined, redis: PriceRedis) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // Fail loudly: without the repo every call would skip the cache and hit DeepSeek.
    if (!priceRepo) {
      next(new Error('priceRepo not wired'));
      return;
    }
    try {
      const trip = req.trip!;
      const settings = trip.costSettings ?? DEFAULT_COST_SETTINGS;
      const plan = planPricing(trip, settings);
      const prices = await resolvePrices(plan.needs, priceRepo, req.user!.userId, redis);
      const estimate: CostEstimate = {
        ...plan.build(prices),
        inputsHash: estimateInputsHash(trip, settings),
        calculatedAt: new Date().toISOString(),
      };
      req.result = estimate;
      next();
    } catch (err) { next(err); }
  };
}
