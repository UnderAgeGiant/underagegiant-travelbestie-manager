import {
  COMPANION_SUGGEST_CHANCE_DEFAULT,
  COMPANION_SUGGEST_CHANCE_BOOSTED,
  COMPANION_BOOST_KARMA_COST,
  COMPANION_SUGGEST_RATE_LIMIT,
  COMPANION_BOOST_DURATION_SECONDS,
  companionBoostKey,
} from '../src/lib/companion-suggest';

describe('companion-suggest lib', () => {
  it('exposes the expected default constants', () => {
    expect(COMPANION_SUGGEST_CHANCE_DEFAULT).toBe(0.20);
    expect(COMPANION_SUGGEST_CHANCE_BOOSTED).toBe(0.75);
    expect(COMPANION_BOOST_KARMA_COST).toBe(2);
    expect(COMPANION_SUGGEST_RATE_LIMIT).toBe(15);
    expect(COMPANION_BOOST_DURATION_SECONDS).toBe(86400); // 24 hours
  });

  it('companionBoostKey namespaces by userId', () => {
    expect(companionBoostKey('user-1')).toBe('companion:boost:user-1');
    expect(companionBoostKey('user-2')).toBe('companion:boost:user-2');
  });
});
