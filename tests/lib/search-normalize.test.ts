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
  it('are the same length and map lowercase accented chars to ascii', () => {
    expect([...SQL_ACCENT_FROM].length).toBe([...SQL_ACCENT_TO].length);
    const map = (s: string) => [...s].map(c => { const i = [...SQL_ACCENT_FROM].indexOf(c); return i < 0 ? c : [...SQL_ACCENT_TO][i]; }).join('');
    expect(map('parís ñandú são')).toBe('paris nandu sao');
  });
});
