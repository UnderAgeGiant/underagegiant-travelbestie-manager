import { itineraryExportSchema } from '../src/schemas/itinerary.schemas';

const ok = (body: unknown) => itineraryExportSchema.safeParse(body).success;
const entries = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, 'v']));

describe('itineraryExportSchema', () => {
  it('accepts an empty body and the legacy 3-map body', () => {
    expect(ok({})).toBe(true);
    expect(ok({ cityNames: { lima: 'Lima' }, attractionNames: { lima_1: 'Catedral' }, ticketRequiredIds: ['lima_1'] })).toBe(true);
  });

  it('accepts a full valid body', () => {
    expect(ok({
      locale: 'en-US', currency: 'CLP', siteUrl: 'https://tripilove.com',
      attractionDetails: { lima_12: {
        nativeName: 'Catedral de Lima', type: 'Iglesia', rating: 4.7,
        schedule: { wed: { open: '06:00', close: '17:30' } },
        website: 'https://catedraldelima.org.pe/', ticketUrl: 'http://x.pe/t', description: 'Una iglesia.',
      } },
      personalLabels: { lunch: 'Almuerzo' },
      destinations: [{ country: 'Perú', flag: '🇵🇪', visa: 'Sin visa', currency: 'Sol (S/)', plug: 'A, C', cities: [{ name: 'Lima', timeDiff: '2 h menos' }] }],
    })).toBe(true);
  });

  it('rejects a non-http URL', () => {
    expect(ok({ attractionDetails: { x: { website: 'javascript:alert(1)' } } })).toBe(false);
    expect(ok({ attractionDetails: { x: { ticketUrl: 'data:text/html,hi' } } })).toBe(false);
    expect(ok({ siteUrl: 'ftp://tripilove.com' })).toBe(false);
    expect(ok({ siteUrl: 'https://' })).toBe(false);
  });

  it('rejects a 1001-char description', () => {
    expect(ok({ attractionDetails: { x: { description: 'a'.repeat(1001) } } })).toBe(false);
    expect(ok({ attractionDetails: { x: { description: 'a'.repeat(1000) } } })).toBe(true);
  });

  it('caps new records at 400 entries and legacy maps at 2000', () => {
    expect(ok({ personalLabels: entries(401) })).toBe(false);
    expect(ok({ attractionDetails: Object.fromEntries(Array.from({ length: 401 }, (_, i) => [`a${i}`, {}])) })).toBe(false);
    expect(ok({ attractionNames: entries(2000) })).toBe(true);
    expect(ok({ attractionNames: entries(2001) })).toBe(false);
    expect(ok({ attractionNames: entries(10000) })).toBe(false);
  });

  it('rejects bad locale, currency, rating and time', () => {
    expect(ok({ locale: 'fr' })).toBe(false);
    expect(ok({ currency: 'clp' })).toBe(false);
    expect(ok({ attractionDetails: { x: { rating: 6 } } })).toBe(false);
    expect(ok({ attractionDetails: { x: { schedule: { mon: { open: '9:00', close: '17:00' } } } } })).toBe(false);
  });

  it('caps destinations at 30 and cities at 60', () => {
    const dest = (cities: number) => ({ country: 'X', cities: Array.from({ length: cities }, () => ({ name: 'c' })) });
    expect(ok({ destinations: Array.from({ length: 31 }, () => dest(1)) })).toBe(false);
    expect(ok({ destinations: [dest(61)] })).toBe(false);
    expect(ok({ destinations: [{ country: 'X', visa: 'v'.repeat(301), cities: [] }] })).toBe(false);
  });
});
