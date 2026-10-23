import type { CostSettings } from '../types';

// Lives apart from trip-cost.ts so repositories and test stubs don't load the ~6.5k-line price tables.
export const DEFAULT_COST_SETTINGS: CostSettings = { origin: null, adults: 1, children: 0, comfort: 'mid' };
