import {
  DEFAULT_COST_SETTINGS, roomCount, planPricing, estimateInputsHash, isEstimateStale,
} from '../../src/lib/trip-cost';
import { HOTEL_PRICES } from '../../src/data/hotel-prices';
import type { Trip, TripStop, TransitLeg, CostSettings, PlannedAttraction } from '../../src/types';

const ORIGIN_SCL = { geonameId: 3871336, name: 'Santiago', countryCode: 'CL', iata: 'SCL' };

function stop(cityId: string, checkIn: string, checkOut: string, attractions: PlannedAttraction[] = []): TripStop {
  return { cityId, checkIn, checkOut, selectedAttractions: attractions };
}

function trip(stops: TripStop[], transits: TransitLeg[] = []): Trip {
  return { id: 't1', title: 'Test', stops, transits, ownerId: 'u1', createdAt: '2026-10-22T00:00:00.000Z' };
}

function settings(over: Partial<CostSettings> = {}): CostSettings {
  return { ...DEFAULT_COST_SETTINGS, ...over };
}

function deepReverseKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(deepReverseKeys);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, deepReverseKeys(x)]));
  }
  return v;
}

describe('roomCount', () => {
  it('pairs adults and adds a room per two extra children', () => {
    expect(roomCount(2, 2)).toBe(1);
    expect(roomCount(3, 0)).toBe(2);
    expect(roomCount(1, 3)).toBe(2);
  });
});

describe('hotels', () => {
  it('prices a table city as nights x rooms x price x season of the check-in month', () => {
    const t = trip([stop('paris', '01/03/2027', '04/03/2027')]);
    const est = planPricing(t, settings({ adults: 2 })).build(new Map());
    expect(est.lodgingUsd).toBe(Math.round(3 * HOTEL_PRICES.paris.mid * HOTEL_PRICES.paris.season[2]));
    expect(est.rooms).toBe(1);
    expect(est.nights).toBe(3);
  });

  it('budget uses beds (adults + children) at the budget price', () => {
    const t = trip([stop('paris', '01/03/2027', '04/03/2027')]);
    const est = planPricing(t, settings({ adults: 1, children: 2, comfort: 'budget' })).build(new Map());
    expect(est.rooms).toBe(3);
    expect(est.lodgingUsd).toBe(Math.round(3 * 3 * HOTEL_PRICES.paris.budget * HOTEL_PRICES.paris.season[2]));
  });

  it('a city without a table asks for a hotel price and prices it with no season multiplier', () => {
    jest.isolateModules(() => {
      jest.doMock('../../src/data/hotel-prices', () => ({ HOTEL_PRICES: {} }));
      const { planPricing: plan } = require('../../src/lib/trip-cost');
      const t = trip([stop('paris', '01/03/2027', '04/03/2027')]);
      const p = plan(t, settings({ adults: 2 }));
      expect(p.needs.map((n: { key: string }) => n.key)).toEqual(['hotel:paris:mid:03']);
      const est = p.build(new Map([['hotel:paris:mid:03', 100]]));
      expect(est.lodgingUsd).toBe(300);
    });
  });

  it('a 0-night stop adds nothing and asks nothing', () => {
    const t = trip([stop('paris', '01/03/2027', '01/03/2027')]);
    const p = planPricing(t, settings());
    expect(p.needs).toEqual([]);
    expect(p.build(new Map()).lodgingUsd).toBe(0);
  });
});

describe('tickets', () => {
  it('2A+2C with a 20 USD attraction costs 60', () => {
    const t = trip([stop('paris', '01/03/2027', '02/03/2027', [{ attractionId: 'aguascalientes_11', startTime: null, endTime: null }])]);
    const est = planPricing(t, settings({ adults: 2, children: 2 })).build(new Map());
    expect(est.ticketsUsd).toBe(60);
    expect(est.ticketCount).toBe(1);
    expect(est.unpricedTicketCount).toBe(0);
  });

  it('an attraction missing from TICKET_PRICES is counted as unpriced and excluded', () => {
    const t = trip([stop('paris', '01/03/2027', '02/03/2027', [{ attractionId: 'no_such_attraction_99', startTime: null, endTime: null }])]);
    const est = planPricing(t, settings()).build(new Map());
    expect(est.unpricedTicketCount).toBe(1);
    expect(est.ticketCount).toBe(1);
    expect(est.ticketsUsd).toBe(0);
  });

  it('personal activities (no attractionId) are skipped entirely', () => {
    const t = trip([stop('paris', '01/03/2027', '02/03/2027', [{ activityType: 'rest', title: 'Nap', startTime: null, endTime: null }])]);
    const est = planPricing(t, settings()).build(new Map());
    expect(est.ticketCount).toBe(0);
    expect(est.unpricedTicketCount).toBe(0);
  });
});

describe('legs', () => {
  it('no origin: no home route keys and missingOrigin is true', () => {
    const t = trip([stop('paris', '01/03/2027', '02/03/2027')]);
    const p = planPricing(t, settings());
    expect(p.needs.some(n => n.key.startsWith('route:'))).toBe(false);
    expect(p.build(new Map()).missingOrigin).toBe(true);
  });

  it('origin airport equal to the first city airport: no home leg', () => {
    const t = trip([stop('paris', '01/03/2027', '02/03/2027')]);
    const p = planPricing(t, settings({ origin: { ...ORIGIN_SCL, iata: 'CDG' } }));
    expect(p.needs.some(n => n.key.startsWith('route:'))).toBe(false);
    expect(p.build(new Map()).missingOrigin).toBe(false);
  });

  it('luxury flights use the business cabin', () => {
    const t = trip([stop('paris', '01/03/2027', '02/03/2027')]);
    const p = planPricing(t, settings({ origin: ORIGIN_SCL, comfort: 'luxury' }));
    expect(p.needs.some(n => n.key.startsWith('route:SCL:CDG:03:flight:') && n.key.endsWith(':business'))).toBe(true);
  });

  it('flights from South America cost 0.8x; both legs are priced', () => {
    const t = trip([stop('paris', '01/03/2027', '02/03/2027')]);
    const p = planPricing(t, settings({ origin: ORIGIN_SCL }));
    const prices = new Map([
      ['route:SCL:CDG:03:flight:economy', 1000],
      ['route:CDG:SCL:03:flight:economy', 500],
    ]);
    const est = p.build(prices);
    expect(est.flightsUsd).toBe(800 + 500);
    expect(est.unestimated).toEqual([]);
  });

  it('a missing route price goes to unestimated and is excluded from the total', () => {
    const t = trip([stop('paris', '01/03/2027', '02/03/2027')]);
    const p = planPricing(t, settings({ origin: ORIGIN_SCL }));
    const est = p.build(new Map([['route:CDG:SCL:03:flight:economy', 500]]));
    expect(est.unestimated).toEqual([{ from: '__home__', to: 'paris', mode: 'flight' }]);
    expect(est.flightsUsd).toBe(500);
    expect(est.totalUsd).toBe(est.flightsUsd + est.lodgingUsd + est.ticketsUsd + est.groundUsd);
  });

  it('a leg with no segment is a bus under 500 km and a flight over it', () => {
    const t = trip([stop('florence', '01/05/2027', '02/05/2027'), stop('rome', '02/05/2027', '03/05/2027')]);
    const keys = planPricing(t, settings()).needs.map(n => n.key);
    expect(keys).toContain('route:florence:rome:05:bus:-');
  });

  it('unknown city: no throw, its legs and hotel go to unestimated, no need asks about it', () => {
    const t = trip([stop('ai_made_up_123', '01/03/2027', '02/03/2027'), stop('paris', '02/03/2027', '03/03/2027')]);
    const p = planPricing(t, settings({ origin: ORIGIN_SCL }));
    expect(p.needs.some(n => n.key.includes('ai_made_up_123'))).toBe(false);
    const est = p.build(new Map());
    expect(est.unestimated).toEqual(expect.arrayContaining([
      { from: 'ai_made_up_123', to: 'ai_made_up_123', mode: 'hotel' },
      { from: '__home__', to: 'ai_made_up_123', mode: 'flight' },
    ]));
  });
});

describe('estimateInputsHash and staleness', () => {
  const base = () => trip([stop('paris', '01/03/2027', '04/03/2027', [{ attractionId: 'paris_0', startTime: null, endTime: null }])]);

  it('changing adults changes the hash', () => {
    expect(estimateInputsHash(base(), settings({ adults: 1 }))).not.toBe(estimateInputsHash(base(), settings({ adults: 2 })));
  });

  it('changing a segment departureDate changes the hash when the leg has no date', () => {
    const withLeg = (dep: string): Trip => ({
      ...base(),
      stops: [stop('paris', '01/03/2027', '04/03/2027'), stop('rome', '04/03/2027', '06/03/2027')],
      transits: [{ fromCityId: 'paris', toCityId: 'rome', segments: [{ mode: 'train', departureDate: dep, departureTime: '10:00', arrivalDate: dep, arrivalTime: '12:00', notes: '' }] }],
    });
    expect(estimateInputsHash(withLeg('04/03/2027'), settings())).not.toBe(estimateInputsHash(withLeg('05/03/2027'), settings()));
  });

  it('reordering object keys does not change the hash', () => {
    const t = base();
    const reordered = deepReverseKeys(t) as Trip;
    const s = settings({ origin: ORIGIN_SCL });
    expect(estimateInputsHash(reordered, deepReverseKeys(s) as CostSettings)).toBe(estimateInputsHash(t, s));
  });

  it('a null costEstimate is never stale', () => {
    expect(isEstimateStale({ ...base(), costEstimate: null })).toBe(false);
  });

  it('is fresh right after stamping and stale after an attraction is added', () => {
    const t = base();
    const stamped = { ...t, costEstimate: { inputsHash: estimateInputsHash(t, DEFAULT_COST_SETTINGS) } as never };
    expect(isEstimateStale(stamped)).toBe(false);
    stamped.stops[0].selectedAttractions.push({ attractionId: 'paris_11', startTime: null, endTime: null });
    expect(isEstimateStale(stamped)).toBe(true);
  });
});
