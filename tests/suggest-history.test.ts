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
  dropRepeatedSuggestions, SUGGEST_HISTORY_MAX,
} from '../src/lib/suggest-history';
import { redis } from '../src/lib/redis';

const opt = (id: number, title: string, cityIds?: string[]) => ({ id, title, summary: 's', highlights: [], cityIds });

describe('suggest-history', () => {
  beforeEach(() => { store.clear(); failRedis = false; (redis.set as jest.Mock).mockClear(); });

  it('key hashes the session id', () => {
    expect(suggestHistoryKey('u1', 's1')).toMatch(/^suggest:history:u1:[0-9a-f]{64}$/);
  });

  it('routeKey uses ordered cityIds, else lower-cased trimmed title', () => {
    expect(routeKey({ title: 'X', cityIds: ['paris', 'rome'] })).toBe('paris>rome');
    expect(routeKey({ title: '  Europa Clásica ', cityIds: [] })).toBe('europa clásica');
    expect(routeKey({ title: 'A' })).toBe('a');
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

  it('drops options whose route was already shown', () => {
    const out = dropRepeatedSuggestions(
      [opt(1, 'Nuevo', ['tokyo']), opt(2, 'Viejo renombrado', ['paris', 'rome'])],
      [{ title: 'Viejo', cityIds: ['paris', 'rome'] }],
    );
    expect(out.map(o => o.id)).toEqual([1]);
  });

  it('returns the unfiltered list when every option is a repeat', () => {
    const opts = [opt(1, 'A', ['paris']), opt(2, 'B', ['rome'])];
    expect(dropRepeatedSuggestions(opts, [{ title: 'x', cityIds: ['paris'] }, { title: 'y', cityIds: ['rome'] }])).toBe(opts);
  });
});
