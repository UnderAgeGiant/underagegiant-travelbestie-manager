import { normalizeSearch, matchCityIds, SQL_ACCENT_FROM, SQL_ACCENT_TO } from '../../src/lib/search-normalize';

describe('normalizeSearch', () => {
  it.each([
    ['París', 'paris'],
    ['PARÍS', 'paris'],
    ['  Bogotá ', 'bogota'],
    ['Ñandú', 'nandu'],
    ['São Paulo', 'sao paulo'],
  ])('%s → %s', (input, out) => expect(normalizeSearch(input)).toBe(out));
});

describe('matchCityIds', () => {
  it('matches a city by display name regardless of accents/case', () => {
    expect(matchCityIds('Barcelona')).toContain('barcelona');
    expect(matchCityIds('paris')).toContain('paris');
    expect(matchCityIds('Dublín')).toContain('dublin');
    expect(matchCityIds('valparaiso')).toContain('valparaiso');
  });
  it('matches multi-word names via the id too', () => {
    expect(matchCityIds('new york')).toContain('newyork');
  });
  it('returns [] for queries shorter than 3 normalized chars', () => {
    expect(matchCityIds('pa')).toEqual([]);
    expect(matchCityIds('  á ')).toEqual([]);
  });
  it('returns [] for a non-city query', () => {
    expect(matchCityIds('zzqx')).toEqual([]);
  });
});

describe('SQL accent maps', () => {
  // Emulates Postgres translate(lower(x), FROM, TO): chars past TO's length are deleted.
  const from = [...SQL_ACCENT_FROM];
  const to = [...SQL_ACCENT_TO];
  const translate = (s: string) => [...s].map(c => { const i = from.indexOf(c); return i < 0 ? c : (to[i] ?? ''); }).join('');

  it('strips accents like the JS normalizer', () => {
    expect(translate('parís ñandú são český')).toBe('paris nandu sao cesky');
    expect(translate('parís')).toBe('paris'); // NFD-stored title
    expect(translate('PARÍS'.toLowerCase())).toBe('paris');
  });

  it('agrees with normalizeSearch for every single-letter result in U+00C0–U+024F', () => {
    const mismatches: string[] = [];
    for (let cp = 0xc0; cp <= 0x24f; cp++) {
      const ch = String.fromCodePoint(cp);
      if (normalizeSearch(ch).length !== 1) continue;
      if (translate(ch.toLowerCase()) !== normalizeSearch(ch)) mismatches.push(ch);
    }
    expect(mismatches).toEqual([]);
  });
});
