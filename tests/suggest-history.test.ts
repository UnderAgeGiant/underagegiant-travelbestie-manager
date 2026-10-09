const store = new Map<string, string>();
let failRedis = false;
jest.mock('../src/lib/redis', () => ({
  redis: {
    get: jest.fn(async (k: string) => { if (failRedis) throw new Error('down'); return store.get(k) ?? null; }),
    set: jest.fn(async (k: string, v: string) => { if (failRedis) throw new Error('down'); store.set(k, v); }),
  },
}));

import {
  suggestHistoryKey, routeKey, loadSuggestHistory, appendSuggestHistory,
  takeSuggestionPage, restrictToMentionedCities, suggestInputsHash, loadSuggestQueue, saveSuggestQueue, SUGGEST_HISTORY_MAX,
} from '../src/lib/suggest-history';
import { redis } from '../src/lib/redis';

const opt = (id: number, title: string, cityIds?: string[]) => ({ id, title, summary: 's', highlights: [], cityIds });

describe('suggest-history', () => {
  beforeEach(() => { store.clear(); failRedis = false; (redis.set as jest.Mock).mockClear(); });

  it('key hashes the session id', () => {
    expect(suggestHistoryKey('u1', 's1')).toMatch(/^suggest:history:u1:[0-9a-f]{64}$/);
  });

  it('routeKey is ordered cityIds plus the lower-cased trimmed title', () => {
    expect(routeKey({ title: 'X', cityIds: ['paris', 'rome'] })).toBe('paris>rome|x');
    expect(routeKey({ title: '  Europa Clásica ', cityIds: [] })).toBe('|europa clásica');
    expect(routeKey({ title: 'A' })).toBe('|a');
  });

  it('same city, different theme is NOT a repeat (single-city sessions)', () => {
    const { page } = takeSuggestionPage(
      [opt(1, 'Coquimbo de playas', ['coquimbo']), opt(2, 'Coquimbo gastronómico', ['coquimbo'])],
      [{ title: 'Coquimbo clásico', cityIds: ['coquimbo'] }],
      2,
    );
    expect(page.map(o => o.title)).toEqual(['Coquimbo de playas', 'Coquimbo gastronómico']);
  });

  describe('restrictToMentionedCities', () => {
    const cityIndex = [
      { id: 'coquimbo', name: 'Coquimbo' }, { id: 'valparaiso', name: 'Valparaíso' },
      { id: 'vinadelmar', name: 'Viña del Mar' }, { id: 'lima', name: 'Lima' },
    ];
    const opts = [
      opt(1, 'A', ['coquimbo']), opt(2, 'B', ['valparaiso', 'vinadelmar']),
      opt(3, 'C', ['coquimbo', 'valparaiso']), opt(4, 'D', []),
    ];

    it('keeps only options whose every city was named by the traveler', () => {
      expect(restrictToMentionedCities(opts, 'Quiero ir a Coquimbo con mi familia', cityIndex).map(o => o.title)).toEqual(['A']);
    });

    it('matches names ignoring accents and case, as whole words', () => {
      expect(restrictToMentionedCities(opts, 'VALPARAISO y vina del mar', cityIndex).map(o => o.title)).toEqual(['B']);
      expect(restrictToMentionedCities(opts, 'quiero limar asperezas en la playa', cityIndex)).toBe(opts);
    });

    it('leaves the options untouched when no indexed city is named, or no index was sent', () => {
      expect(restrictToMentionedCities(opts, 'playa y sol', cityIndex)).toBe(opts);
      expect(restrictToMentionedCities(opts, 'Coquimbo', undefined)).toBe(opts);
    });

    it('returns the unfiltered list when no option survives (never empty)', () => {
      expect(restrictToMentionedCities(opts, 'Lima', cityIndex)).toBe(opts);
    });
  });

  it('appends across calls with a 24h TTL and caps at SUGGEST_HISTORY_MAX', async () => {
    for (let i = 0; i < 20; i++) await appendSuggestHistory('u1', 's1', [opt(1, `t${i}a`), opt(2, `t${i}b`)]);
    const h = await loadSuggestHistory('u1', 's1');
    expect(h).toHaveLength(SUGGEST_HISTORY_MAX);
    expect(h[h.length - 1]).toEqual({ title: 't19b', cityIds: [] });
    expect((redis.set as jest.Mock).mock.calls[0].slice(2)).toEqual(['EX', 86400]);
  });

  it('load returns [] on miss and on Redis error; append swallows errors', async () => {
    expect(await loadSuggestHistory('u1', 'none')).toEqual([]);
    failRedis = true;
    expect(await loadSuggestHistory('u1', 's1')).toEqual([]);
    await expect(appendSuggestHistory('u1', 's1', [opt(1, 'a')])).resolves.toBeUndefined();
  });

  it('takes the first unseen options as the page, renumbered 1..n, and keeps the other unseen as rest', () => {
    const { page, rest } = takeSuggestionPage(
      [opt(5, 'Viejo', ['paris', 'rome']), opt(6, 'A', ['tokyo']), opt(7, 'B', ['lima']), opt(8, 'C', ['cusco'])],
      [{ title: ' viejo ', cityIds: ['paris', 'rome'] }],
      2,
    );
    expect(page.map(o => [o.id, o.title])).toEqual([[1, 'A'], [2, 'B']]);
    expect(rest.map(o => o.title)).toEqual(['C']);
  });

  it('falls back to the first options when every one is a repeat (never empty)', () => {
    const { page, rest } = takeSuggestionPage(
      [opt(1, 'A', ['paris']), opt(2, 'B', ['rome'])],
      [{ title: 'A', cityIds: ['paris'] }, { title: 'B', cityIds: ['rome'] }],
      2,
    );
    expect(page.map(o => o.title)).toEqual(['A', 'B']);
    expect(rest).toEqual([]);
  });

  it('inputs hash changes with preferences, duration, budget or city index', () => {
    const base = { preferences: 'cultura', duration: 7, budget: 'medio', cityIndex: [{ id: 'paris', name: 'París' }] };
    const h = suggestInputsHash(base);
    expect(suggestInputsHash({ ...base })).toBe(h);
    expect(suggestInputsHash({ ...base, preferences: 'playa' })).not.toBe(h);
    expect(suggestInputsHash({ ...base, duration: 8 })).not.toBe(h);
    expect(suggestInputsHash({ ...base, budget: 'alto' })).not.toBe(h);
    expect(suggestInputsHash({ ...base, cityIndex: [{ id: 'rome', name: 'Roma' }] })).not.toBe(h);
  });

  it('queue round-trips with a 24h TTL; load returns null on miss and on Redis error', async () => {
    await saveSuggestQueue('u1', 's1', { inputsHash: 'h', options: [opt(3, 'C', ['lima'])] });
    expect(await loadSuggestQueue('u1', 's1')).toEqual({ inputsHash: 'h', options: [opt(3, 'C', ['lima'])] });
    expect((redis.set as jest.Mock).mock.calls[0][0]).toMatch(/^suggest:queue:u1:[0-9a-f]{64}$/);
    expect((redis.set as jest.Mock).mock.calls[0].slice(2)).toEqual(['EX', 86400]);
    expect(await loadSuggestQueue('u1', 'none')).toBeNull();
    failRedis = true;
    expect(await loadSuggestQueue('u1', 's1')).toBeNull();
    await expect(saveSuggestQueue('u1', 's1', { inputsHash: 'h', options: [] })).resolves.toBeUndefined();
  });
});
