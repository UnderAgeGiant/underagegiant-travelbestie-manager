import { KARMA_PACKAGES, findPackage } from '../src/lib/karma-packages';

describe('KARMA_PACKAGES pricing', () => {
  it('every package has a prices map with USD matching the legacy price field', () => {
    for (const pkg of KARMA_PACKAGES) {
      expect(pkg.prices.USD).toBe(pkg.price);
      expect(pkg.currency).toBe('USD');
    }
  });

  it('every package has a CLP price', () => {
    for (const pkg of KARMA_PACKAGES) {
      expect(typeof pkg.prices.CLP).toBe('string');
      expect(Number(pkg.prices.CLP)).toBeGreaterThan(0);
    }
  });

  it('findPackage still resolves by id and carries prices through', () => {
    const pkg = findPackage('karma_10');
    expect(pkg).toBeDefined();
    expect(pkg!.prices.CLP).toBe('900');
  });
});
