import { KarmaPackage } from '../types';

export const KARMA_PACKAGES: KarmaPackage[] = [
  { id: 'karma_10',  karma: 10,  price: '0.99', currency: 'USD', label: '10 Karma'  },
  { id: 'karma_25',  karma: 25,  price: '1.99', currency: 'USD', label: '25 Karma'  },
  { id: 'karma_50',  karma: 50,  price: '3.99', currency: 'USD', label: '50 Karma'  },
  { id: 'karma_100', karma: 100, price: '6.99', currency: 'USD', label: '100 Karma' },
];

export function findPackage(id: string): KarmaPackage | undefined {
  return KARMA_PACKAGES.find(p => p.id === id);
}
