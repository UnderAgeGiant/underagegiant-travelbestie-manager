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
  takeSuggestionPage, suggestInputsHash, loadSuggestQueue, saveSuggestQueue, SUGGEST_HISTORY_MAX,
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

  it('takes the first unseen options as the page, renumbered 1..n, and keeps the other unseen as rest', () => {
    const { page, rest } = takeSuggestionPage(
      [opt(5, 'Viejo', ['paris', 'rome']), opt(6, 'A', ['tokyo']), opt(7, 'B', ['lima']), opt(8, 'C', ['cusco'])],
      [{ title: 'Viejo renombrado', cityIds: ['paris', 'rome'] }],
      2,
    );
    expect(page.map(o => [o.id, o.title])).toEqual([[1, 'A'], [2, 'B']]);
    expect(rest.map(o => o.title)).toEqual(['C']);
  });

  it('falls back to the first options when every one is a repeat (never empty)', () => {
    const { page, rest } = takeSuggestionPage(
      [opt(1, 'A', ['paris']), opt(2, 'B', ['rome'])],
      [{ title: 'x', cityIds: ['paris'] }, { title: 'y', cityIds: ['rome'] }],
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
