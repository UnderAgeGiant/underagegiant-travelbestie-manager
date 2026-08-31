import { fetchForecast, fetchHistoricalRange } from '../../src/lib/open-meteo';

const FORECAST_RESPONSE = {
  daily: {
    time: ['2026-08-30', '2026-08-31'],
    weather_code: [3, 61],
    temperature_2m_max: [23.4, 19.8],
    temperature_2m_min: [14.1, 12.0],
  },
};

const ARCHIVE_RESPONSE = {
  daily: {
    time: ['2025-08-30'],
    weather_code: [0],
    temperature_2m_max: [25.0],
    temperature_2m_min: [15.5],
  },
};

describe('open-meteo', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

  it('fetchForecast calls the forecast endpoint with the expected params and normalizes the result', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => FORECAST_RESPONSE,
    });
    global.fetch = mockFetch as any;

    const result = await fetchForecast(48.85, 2.35, 16);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = new URL(mockFetch.mock.calls[0][0] as string);
    expect(calledUrl.origin + calledUrl.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(calledUrl.searchParams.get('latitude')).toBe('48.85');
    expect(calledUrl.searchParams.get('longitude')).toBe('2.35');
    expect(calledUrl.searchParams.get('forecast_days')).toBe('16');
    expect(calledUrl.searchParams.get('daily')).toBe('weather_code,temperature_2m_max,temperature_2m_min');

    expect(result).toEqual([
      { date: '2026-08-30', tempMaxC: 23.4, tempMinC: 14.1, weatherCode: 3 },
      { date: '2026-08-31', tempMaxC: 19.8, tempMinC: 12.0, weatherCode: 61 },
    ]);
  });

  it('fetchHistoricalRange calls the archive endpoint with start_date/end_date', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ARCHIVE_RESPONSE,
    });
    global.fetch = mockFetch as any;

    const result = await fetchHistoricalRange(48.85, 2.35, '2025-08-30', '2025-08-30');

    const calledUrl = new URL(mockFetch.mock.calls[0][0] as string);
    expect(calledUrl.origin + calledUrl.pathname).toBe('https://archive-api.open-meteo.com/v1/archive');
    expect(calledUrl.searchParams.get('start_date')).toBe('2025-08-30');
    expect(calledUrl.searchParams.get('end_date')).toBe('2025-08-30');
    expect(result).toEqual([{ date: '2025-08-30', tempMaxC: 25.0, tempMinC: 15.5, weatherCode: 0 }]);
  });

  it('fetchForecast throws when the response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }) as any;
    await expect(fetchForecast(48.85, 2.35, 16)).rejects.toThrow(/Open-Meteo forecast error/);
  });

  it('fetchHistoricalRange throws when the response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }) as any;
    await expect(fetchHistoricalRange(48.85, 2.35, '2025-08-30', '2025-08-30')).rejects.toThrow(/Open-Meteo archive error/);
  });
});
