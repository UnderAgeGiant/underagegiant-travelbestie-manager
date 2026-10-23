import { getUsdRates } from '../src/lib/fx';

// In-memory fake for the shared Redis client; each method can be made to throw per test.
const store = new Map<string, string>();
const mockRedis = {
  get: jest.fn(async (key: string) => store.get(key) ?? null),
  set: jest.fn(async (key: string, value: string) => { store.set(key, value); return 'OK'; }),
};
jest.mock('../src/lib/redis', () => ({
  redis: {
    get: (...args: any[]) => (mockRedis.get as any)(...args),
    set: (...args: any[]) => (mockRedis.set as any)(...args),
  },
}));

const mockFetch = jest.fn();
(global as any).fetch = (...args: any[]) => mockFetch(...args);

const OK_BODY = { result: 'success', base_code: 'USD', rates: { USD: 1, CLP: 940.12 } };
const okResponse = () => ({ ok: true, status: 200, json: async () => OK_BODY });
const serverError = () => ({ ok: false, status: 500, json: async () => ({}) });

describe('getUsdRates (GET /fx/rates)', () => {
  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
    mockRedis.get.mockImplementation(async (key: string) => store.get(key) ?? null);
    mockRedis.set.mockImplementation(async (key: string, value: string) => { store.set(key, value); return 'OK'; });
  });

  it('cache hit: serves fx:usd without fetching upstream', async () => {
    const cached = { base: 'USD', rates: { CLP: 900 }, fetchedAt: '2026-10-20T00:00:00.000Z' };
    store.set('fx:usd', JSON.stringify(cached));

    const result = await getUsdRates();

    expect(result).toEqual(cached);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('miss: fetches once and writes fx:usd (TTL 86400) and fx:usd:last (no TTL)', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());

    const result = await getUsdRates();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('https://open.er-api.com/v6/latest/USD');
    expect(result.base).toBe('USD');
    expect(result.rates).toEqual({ USD: 1, CLP: 940.12 });
    expect(result.fetchedAt).toEqual(expect.any(String));

    expect(mockRedis.set).toHaveBeenCalledWith('fx:usd', JSON.stringify(result), 'EX', 86400);
    expect(mockRedis.set).toHaveBeenCalledWith('fx:usd:last', JSON.stringify(result));
    expect(mockRedis.set.mock.calls.find(c => c[0] === 'fx:usd:last')).toHaveLength(2);
  });

  it('upstream 500 with a stored fx:usd:last: serves the last-good rates', async () => {
    const last = { base: 'USD', rates: { CLP: 880 }, fetchedAt: '2026-10-01T00:00:00.000Z' };
    store.set('fx:usd:last', JSON.stringify(last));
    mockFetch.mockResolvedValueOnce(serverError());

    const result = await getUsdRates();

    expect(result).toEqual(last);
  });

  it('upstream 500 and no fx:usd:last: returns the USD-only fallback', async () => {
    mockFetch.mockResolvedValueOnce(serverError());

    const result = await getUsdRates();

    expect(result).toEqual({ base: 'USD', rates: { USD: 1 }, fetchedAt: null });
  });

  it('Redis throws: still returns rates from upstream', async () => {
    mockRedis.get.mockRejectedValue(new Error('redis down'));
    mockRedis.set.mockRejectedValue(new Error('redis down'));
    mockFetch.mockResolvedValueOnce(okResponse());

    const result = await getUsdRates();

    expect(result.rates).toEqual({ USD: 1, CLP: 940.12 });
    expect(result.fetchedAt).toEqual(expect.any(String));
  });
});
