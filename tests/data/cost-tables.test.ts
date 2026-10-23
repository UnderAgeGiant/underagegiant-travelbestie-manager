import { CITY_NAMES } from '../../src/data/cities';
import { HOTEL_PRICES } from '../../src/data/hotel-prices';
import { TICKET_PRICES } from '../../src/data/ticket-prices';
import { CITY_AIRPORTS } from '../../src/data/city-airports';

describe('generated cost tables', () => {
  const cityIds = Object.keys(CITY_NAMES);

  it('every city has a nearest airport with a valid IATA code and ISO2 country', () => {
    for (const id of cityIds) {
      const a = CITY_AIRPORTS[id];
      expect(a).toBeDefined();
      expect(a.iata).toMatch(/^[A-Z]{3}$/);
      expect(a.country).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('at least 95% of cities have hotel prices', () => {
    const covered = cityIds.filter(id => HOTEL_PRICES[id] !== undefined).length;
    expect(covered / cityIds.length).toBeGreaterThanOrEqual(0.95);
  });

  it('every hotel entry is ordered budget < mid < luxury < 5000 with 12 season multipliers in [0.5, 2]', () => {
    for (const [id, h] of Object.entries(HOTEL_PRICES)) {
      expect({ id, ok: h.budget > 0 && h.budget < h.mid && h.mid < h.luxury && h.luxury < 5000 })
        .toEqual({ id, ok: true });
      expect(h.season).toHaveLength(12);
      for (const s of h.season) {
        expect(s).toBeGreaterThanOrEqual(0.5);
        expect(s).toBeLessThanOrEqual(2);
      }
    }
  });

  it('every ticket price is in [0, 1000]', () => {
    for (const [id, v] of Object.entries(TICKET_PRICES)) {
      expect({ id, ok: v >= 0 && v <= 1000 }).toEqual({ id, ok: true });
    }
  });

  // The brief named 'paris_louvre', which does not exist; the Louvre is 'paris_6'.
  it('the Louvre ticket (paris_6) is between 15 and 40 USD', () => {
    expect(TICKET_PRICES['paris_6']).toBeGreaterThanOrEqual(15);
    expect(TICKET_PRICES['paris_6']).toBeLessThanOrEqual(40);
  });
});
