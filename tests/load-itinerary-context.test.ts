const mockGetWeatherDays = jest.fn();
const mockGetUsdRates = jest.fn();
jest.mock('../src/lib/weather-days', () => ({ getWeatherDays: (...a: any[]) => mockGetWeatherDays(...a) }));
jest.mock('../src/lib/fx', () => ({ getUsdRates: () => mockGetUsdRates() }));

import { loadItineraryContext } from '../src/middleware/trips/load-itinerary-context.middleware';

function req(stops: any[], body: any = {}) {
  return { trip: { stops }, body } as any;
}
const stop = (cityId: string, checkIn: string, checkOut: string) => ({ cityId, checkIn, checkOut, selectedAttractions: [] });

describe('loadItineraryContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetWeatherDays.mockImplementation(async (_c: string, iso: string[]) => iso.map(d => ({ date: d, type: 'forecast' })));
    mockGetUsdRates.mockResolvedValue({ base: 'USD', rates: { USD: 1, CLP: 950 }, fetchedAt: null });
  });

  it('loads weather per stop, check-in through check-out', async () => {
    const r = req([stop('lima', '12/03/2027', '14/03/2027'), stop('cusco', '14/03/2027', '15/03/2027')]);
    const next = jest.fn();
    await loadItineraryContext(r, {} as any, next);
    expect(next).toHaveBeenCalledWith();
    expect(mockGetWeatherDays).toHaveBeenCalledWith('lima', ['2027-03-12', '2027-03-13', '2027-03-14']);
    expect(mockGetWeatherDays).toHaveBeenCalledWith('cusco', ['2027-03-14', '2027-03-15']);
    expect(r.itineraryContext.weather['0']).toHaveLength(3);
    expect(r.itineraryContext.weather['1']).toHaveLength(2);
    expect(r.itineraryContext.exportedAt).toBeInstanceOf(Date);
  });

  it('a weather failure leaves that stop empty and still calls next() without error', async () => {
    mockGetWeatherDays.mockRejectedValueOnce(new Error('redis down'));
    const r = req([stop('lima', '12/03/2027', '13/03/2027'), stop('cusco', '13/03/2027', '14/03/2027')]);
    const next = jest.fn();
    await loadItineraryContext(r, {} as any, next);
    expect(next).toHaveBeenCalledWith();
    expect(r.itineraryContext.weather['0']).toEqual([]);
    expect(r.itineraryContext.weather['1']).toHaveLength(2);
  });

  it('skips a stop longer than 31 days and a city without coordinates', async () => {
    const r = req([stop('lima', '01/03/2027', '10/04/2027'), stop('atlantis_nowhere', '10/04/2027', '11/04/2027')]);
    await loadItineraryContext(r, {} as any, jest.fn());
    expect(mockGetWeatherDays).not.toHaveBeenCalled();
    expect(r.itineraryContext.weather['0']).toEqual([]);
    expect(r.itineraryContext.weather['1']).toEqual([]);
  });

  it('resolves usdRate for the body currency', async () => {
    const r = req([], { currency: 'CLP' });
    await loadItineraryContext(r, {} as any, jest.fn());
    expect(r.itineraryContext.usdRate).toBe(950);
  });

  it('usdRate is null when currency is missing, USD, unknown, or FX throws', async () => {
    for (const body of [{}, { currency: 'USD' }, { currency: 'XYZ' }]) {
      const r = req([], body);
      await loadItineraryContext(r, {} as any, jest.fn());
      expect(r.itineraryContext.usdRate).toBeNull();
    }
    mockGetUsdRates.mockRejectedValueOnce(new Error('boom'));
    const r = req([], { currency: 'CLP' });
    await loadItineraryContext(r, {} as any, jest.fn());
    expect(r.itineraryContext.usdRate).toBeNull();
  });
});
