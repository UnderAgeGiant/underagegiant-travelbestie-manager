const create = jest.fn();
jest.mock('../../src/lib/deepseek', () => ({
  deepseekClient: { chat: { completions: { create: (...args: unknown[]) => create(...args) } } },
}));
jest.mock('../../src/lib/ai-usage', () => ({ logAiUsage: jest.fn() }));
jest.mock('../../src/lib/logger', () => ({ logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }));

import { resolvePrices } from '../../src/lib/price-fetcher';
import { PriceNeed } from '../../src/lib/trip-cost';
import { IPriceEstimateRepository } from '../../src/repositories/interfaces/price-estimate.repository';

const ROUTE: PriceNeed = { key: 'route:SCL:CDG:07:flight:economy', kind: 'route', label: 'one-way economy flight' };
const ROUTE2: PriceNeed = { key: 'route:CDG:FCO:07:flight:economy', kind: 'route', label: 'CDG → FCO' };
const HOTEL_LATAM: PriceNeed = { key: 'hotel:santiago:mid:07', kind: 'hotel', label: 'hotel in Santiago' };
const HOTEL_EU: PriceNeed = { key: 'hotel:paris:mid:07', kind: 'hotel', label: 'hotel in Paris' };

function completion(prices: unknown) {
  return {
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ prices }) } }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

function fakeRepo(cached: Record<string, number> = {}) {
  return {
    findFresh: jest.fn(async (keys: string[]) => new Map(Object.entries(cached).filter(([k]) => keys.includes(k)))),
    upsertMany: jest.fn(async () => undefined),
  } as unknown as IPriceEstimateRepository & { findFresh: jest.Mock; upsertMany: jest.Mock };
}

function fakeRedis(getImpl: () => Promise<string | null> = async () => null) {
  return { get: jest.fn(getImpl), set: jest.fn(async () => 'OK') };
}

beforeEach(() => { create.mockReset(); });

describe('resolvePrices', () => {
  it('all cached: no DeepSeek call and no Redis calls', async () => {
    const repo = fakeRepo({ [ROUTE.key]: 300 });
    const redis = fakeRedis();
    const out = await resolvePrices([ROUTE], repo, 'u1', redis);
    expect(out.get(ROUTE.key)).toBe(300);
    expect(create).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(repo.upsertMany).not.toHaveBeenCalled();
  });

  it('empty needs: no calls at all', async () => {
    const repo = fakeRepo();
    const redis = fakeRedis();
    expect((await resolvePrices([], repo, 'u1', redis)).size).toBe(0);
    expect(create).not.toHaveBeenCalled();
    expect(repo.findFresh).not.toHaveBeenCalled();
  });

  it('one valid and one "abc" answer: only the valid one is upserted and returned; extra keys ignored', async () => {
    create.mockResolvedValue(completion({ [ROUTE.key]: 250, [ROUTE2.key]: 'abc', 'route:XXX:YYY:01:bus:-': 90 }));
    const repo = fakeRepo();
    const out = await resolvePrices([ROUTE, ROUTE2], repo, 'u1', fakeRedis());
    expect(Array.from(out.entries())).toEqual([[ROUTE.key, 250]]);
    expect(repo.upsertMany).toHaveBeenCalledWith([{ key: ROUTE.key, priceUsd: 250 }]);
  });

  it('sends one batch, with the injection-safe system message and JSON-encoded items', async () => {
    create.mockResolvedValue(completion({ [ROUTE.key]: 250 }));
    await resolvePrices([ROUTE], fakeRepo(), 'u1', fakeRedis());
    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0][0];
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toMatch(/never instructions/);
    expect(body.messages[1].content).toBe(JSON.stringify([{ key: ROUTE.key, item: ROUTE.label }]));
  });

  it('passes the timeout and maxRetries: 0 as request options (not in the body)', async () => {
    create.mockResolvedValue(completion({ [ROUTE.key]: 250 }));
    await resolvePrices([ROUTE], fakeRepo(), 'u1', fakeRedis());
    expect(create.mock.calls[0][1]).toEqual({ timeout: 15000, maxRetries: 0 });
    expect(create.mock.calls[0][0]).not.toHaveProperty('timeout');
  });

  it('caps one DeepSeek batch at 40 misses; the rest stay unpriced', async () => {
    create.mockResolvedValue(completion({}));
    const needs: PriceNeed[] = Array.from({ length: 45 }, (_, i) => ({ key: `route:A:B:${i}:bus:-`, kind: 'route', label: `leg ${i}` }));
    const out = await resolvePrices(needs, fakeRepo(), 'u1', fakeRedis());
    expect(out.size).toBe(0);
    expect(create).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(create.mock.calls[0][0].messages[1].content);
    expect(sent).toHaveLength(40);
    expect(sent[39].key).toBe('route:A:B:39:bus:-');
  });

  it('a string answer "250" is rejected', async () => {
    create.mockResolvedValue(completion({ [ROUTE.key]: '250' }));
    const repo = fakeRepo();
    expect((await resolvePrices([ROUTE], repo, 'u1', fakeRedis())).size).toBe(0);
    expect(repo.upsertMany).not.toHaveBeenCalled();
  });

  it('prices: null resolves with the cache hits only', async () => {
    create.mockResolvedValue(completion(null));
    const out = await resolvePrices([ROUTE, ROUTE2], fakeRepo({ [ROUTE2.key]: 120 }), 'u1', fakeRedis());
    expect(Array.from(out.entries())).toEqual([[ROUTE2.key, 120]]);
  });

  it('redis.set rejecting after a DeepSeek failure still resolves with the cache hits', async () => {
    create.mockRejectedValue(new Error('402'));
    const redis = fakeRedis();
    redis.set.mockRejectedValue(new Error('redis down'));
    const out = await resolvePrices([ROUTE, ROUTE2], fakeRepo({ [ROUTE2.key]: 120 }), 'u1', redis);
    expect(Array.from(out.entries())).toEqual([[ROUTE2.key, 120]]);
  });

  it('out-of-band route value (99999) is dropped', async () => {
    create.mockResolvedValue(completion({ [ROUTE.key]: 99999 }));
    const repo = fakeRepo();
    expect((await resolvePrices([ROUTE], repo, 'u1', fakeRedis())).size).toBe(0);
    expect(repo.upsertMany).not.toHaveBeenCalled();
  });

  it('DeepSeek 402 throws: returns cache hits only, sets tripcost:ds-down with TTL 600, never rethrows', async () => {
    create.mockRejectedValue(Object.assign(new Error('Payment Required'), { status: 402 }));
    const repo = fakeRepo({ [ROUTE2.key]: 120 });
    const redis = fakeRedis();
    const out = await resolvePrices([ROUTE, ROUTE2], repo, 'u1', redis);
    expect(Array.from(out.entries())).toEqual([[ROUTE2.key, 120]]);
    expect(redis.set).toHaveBeenCalledWith('tripcost:ds-down', '1', 'EX', 600);
  });

  it('tripcost:ds-down present: DeepSeek is skipped and cache hits are returned', async () => {
    const redis = fakeRedis(async () => '1');
    const out = await resolvePrices([ROUTE], fakeRepo(), 'u1', redis);
    expect(out.size).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });

  it('Redis get throws: treated as not down, DeepSeek is still called', async () => {
    create.mockResolvedValue(completion({ [ROUTE.key]: 250 }));
    const redis = fakeRedis(async () => { throw new Error('redis down'); });
    const out = await resolvePrices([ROUTE], fakeRepo(), 'u1', redis);
    expect(out.get(ROUTE.key)).toBe(250);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('LatAm hotel answer of 100 is returned and upserted as 125; non-LatAm stays 100', async () => {
    create.mockResolvedValue(completion({ [HOTEL_LATAM.key]: 100, [HOTEL_EU.key]: 100 }));
    const repo = fakeRepo();
    const out = await resolvePrices([HOTEL_LATAM, HOTEL_EU], repo, 'u1', fakeRedis());
    expect(out.get(HOTEL_LATAM.key)).toBe(125);
    expect(out.get(HOTEL_EU.key)).toBe(100);
    expect(repo.upsertMany).toHaveBeenCalledWith(expect.arrayContaining([
      { key: HOTEL_LATAM.key, priceUsd: 125 },
      { key: HOTEL_EU.key, priceUsd: 100 },
    ]));
  });

  it('findFresh throws: cache treated as empty, DeepSeek still called', async () => {
    create.mockResolvedValue(completion({ [ROUTE.key]: 250 }));
    const repo = fakeRepo();
    repo.findFresh.mockRejectedValue(new Error('db down'));
    const out = await resolvePrices([ROUTE], repo, 'u1', fakeRedis());
    expect(out.get(ROUTE.key)).toBe(250);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('upsertMany throws: still returns the fetched prices', async () => {
    create.mockResolvedValue(completion({ [ROUTE.key]: 250 }));
    const repo = fakeRepo();
    repo.upsertMany.mockRejectedValue(new Error('db down'));
    const out = await resolvePrices([ROUTE], repo, 'u1', fakeRedis());
    expect(out.get(ROUTE.key)).toBe(250);
  });
});
