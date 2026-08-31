import { WeatherController } from '../src/controllers/weather.controller';

const mockRedis = {
  mget: jest.fn(),
  pipeline: jest.fn(),
};

jest.mock('../src/lib/redis', () => ({
  redis: {
    mget: (...args: any[]) => mockRedis.mget(...args),
    pipeline: (...args: any[]) => mockRedis.pipeline(...args),
  },
  weatherDayKey: (cityId: string, isoDate: string) => `weather:${cityId}:${isoDate}`,
  WEATHER_CACHE_TTL: 43200,
}));

const mockFetchForecast = jest.fn();
const mockFetchHistoricalRange = jest.fn();
jest.mock('../src/lib/open-meteo', () => ({
  fetchForecast: (...args: any[]) => mockFetchForecast(...args),
  fetchHistoricalRange: (...args: any[]) => mockFetchHistoricalRange(...args),
}));

// Fix "today" so forecast-vs-historic classification is deterministic.
jest.mock('../src/lib/weather-dates', () => {
  const actual = jest.requireActual('../src/lib/weather-dates');
  return { ...actual, todayISO: () => '2026-08-30' };
});

function buildReq(isoDates: string[], cityId = 'paris') {
  return { weatherQuery: { cityId, checkIn: '30/08/2026', checkOut: '30/08/2026', isoDates } } as any;
}

describe('WeatherController.get', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.pipeline.mockReturnValue({ set: jest.fn(), exec: jest.fn().mockResolvedValue([]) });
  });

  it('serves entirely from cache when every requested day is a Redis hit', async () => {
    mockRedis.mget.mockResolvedValue([
      JSON.stringify({ type: 'forecast', tempMaxC: 23, tempMinC: 14, weatherCode: 3 }),
    ]);
    const controller = new WeatherController();
    const req = buildReq(['2026-08-30']);
    const next = jest.fn();
    await controller.get(req, {} as any, next);

    expect(mockFetchForecast).not.toHaveBeenCalled();
    expect(req.result.days).toEqual([
      { date: '30/08/2026', type: 'forecast', tempMaxC: 23, tempMinC: 14, weatherCode: 3 },
    ]);
    expect(next).toHaveBeenCalled();
  });

  it('fetches a forecast-eligible miss from the forecast endpoint and caches it', async () => {
    mockRedis.mget.mockResolvedValue([null]);
    mockFetchForecast.mockResolvedValue([
      { date: '2026-08-30', tempMaxC: 23, tempMinC: 14, weatherCode: 3 },
    ]);
    const pipelineSet = jest.fn();
    mockRedis.pipeline.mockReturnValue({ set: pipelineSet, exec: jest.fn().mockResolvedValue([]) });

    const controller = new WeatherController();
    const req = buildReq(['2026-08-30']); // == today -> forecast-eligible
    const next = jest.fn();
    await controller.get(req, {} as any, next);

    expect(mockFetchForecast).toHaveBeenCalledWith(48.8534951, 2.3483915, expect.any(Number));
    expect(pipelineSet).toHaveBeenCalledWith(
      'weather:paris:2026-08-30',
      JSON.stringify({ type: 'forecast', tempMaxC: 23, tempMinC: 14, weatherCode: 3 }),
      'EX', 43200,
    );
    expect(req.result.days[0]).toEqual({ date: '30/08/2026', type: 'forecast', tempMaxC: 23, tempMinC: 14, weatherCode: 3 });
  });

  it('fetches a historic miss (beyond the forecast horizon) from the archive endpoint shifted back 365 days', async () => {
    mockRedis.mget.mockResolvedValue([null]);
    mockFetchHistoricalRange.mockResolvedValue([
      { date: '2025-09-20', tempMaxC: 18, tempMinC: 9, weatherCode: 61 },
    ]);
    mockRedis.pipeline.mockReturnValue({ set: jest.fn(), exec: jest.fn().mockResolvedValue([]) });

    const controller = new WeatherController();
    const req = buildReq(['2026-09-20']); // > today+15 -> historic
    const next = jest.fn();
    await controller.get(req, {} as any, next);

    expect(mockFetchHistoricalRange).toHaveBeenCalledWith(48.8534951, 2.3483915, '2025-09-20', '2025-09-20');
    expect(req.result.days[0]).toEqual({ date: '20/09/2026', type: 'historic', tempMaxC: 18, tempMinC: 9, weatherCode: 61 });
  });

  it('marks a day unavailable (without failing the whole request) when the forecast fetch throws', async () => {
    mockRedis.mget.mockResolvedValue([null]);
    mockFetchForecast.mockRejectedValue(new Error('network down'));
    mockRedis.pipeline.mockReturnValue({ set: jest.fn(), exec: jest.fn().mockResolvedValue([]) });

    const controller = new WeatherController();
    const req = buildReq(['2026-08-30']);
    const next = jest.fn();
    await controller.get(req, {} as any, next);

    expect(req.result.days[0]).toEqual({ date: '30/08/2026', type: 'unavailable' });
    expect(next).toHaveBeenCalled();
  });
});
