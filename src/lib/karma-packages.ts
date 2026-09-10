import { KarmaPackage } from '../types';

interface PackageSeed {
  id: string;
  karma: number;
  label: string;
  prices: Record<string, string>;
}

const PACKAGE_SEEDS: PackageSeed[] = [
  { id: 'karma_10',  karma: 10,  label: '10 Karma',  prices: { USD: '0.99', CLP: '900'  } },
  { id: 'karma_25',  karma: 25,  label: '25 Karma',  prices: { USD: '1.99', CLP: '1800' } },
  { id: 'karma_50',  karma: 50,  label: '50 Karma',  prices: { USD: '3.99', CLP: '3600' } },
  { id: 'karma_100', karma: 100, label: '100 Karma', prices: { USD: '6.99', CLP: '6300' } },
];

export const KARMA_PACKAGES: KarmaPackage[] = PACKAGE_SEEDS.map(seed => ({
  id: seed.id,
  karma: seed.karma,
  label: seed.label,
  price: seed.prices.USD,
  currency: 'USD',
  prices: seed.prices,
}));

export function findPackage(id: string): KarmaPackage | undefined {
  return KARMA_PACKAGES.find(p => p.id === id);
}
