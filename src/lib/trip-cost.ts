import { createHash } from 'crypto';
import type { ComfortLevel, CostEstimate, CostSettings, Place, Trip, TripStop, TransitLeg, UnestimatedLeg } from '../types';
import { HOTEL_PRICES } from '../data/hotel-prices';
import { TICKET_PRICES } from '../data/ticket-prices';
import { CITY_AIRPORTS } from '../data/city-airports';
import { CITY_COORDS } from '../data/city-coords';
import { CITY_NAMES } from '../data/cities';
import { DEFAULT_COST_SETTINGS } from './cost-defaults';

export { DEFAULT_COST_SETTINGS } from './cost-defaults';
export const ROUTE_CACHE_DAYS = 90;
// Research doc Part C (docs/superpowers/specs/2026-10-18-trip-cost-estimate-research.md): LatAm hotels ran ~20% cheaper than real prices.
// Applied to the hotel tables at build time (B1) and to on-demand hotel answers for LatAm cities.
export const LATAM_HOTEL_FACTOR = 1.25;
// Research doc Part C: flights departing from South America came out ~20% dearer than real prices. Applied per flight leg here.
export const SOUTH_AMERICA_FLIGHT_FACTOR = 0.8;

// ISO-3166 alpha-2 country codes. Scope per research doc Part C.
const SOUTH_AMERICA = ['AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'GF', 'GY', 'PE', 'PY', 'SR', 'UY', 'VE'];
const MEXICO_CENTRAL_AMERICA_CARIBBEAN = [
  'MX', 'GT', 'BZ', 'HN', 'SV', 'NI', 'CR', 'PA',
  'CU', 'DO', 'HT', 'JM', 'PR', 'TT', 'BS', 'BB', 'AG', 'AI', 'AW', 'BM', 'BQ', 'CW', 'DM', 'GD', 'GP', 'KN',
  'KY', 'LC', 'MQ', 'MS', 'SX', 'TC', 'VC', 'VG', 'VI', 'BL', 'MF',
];
export const SOUTH_AMERICA_ISO2: ReadonlySet<string> = new Set(SOUTH_AMERICA);
export const LATAM_ISO2: ReadonlySet<string> = new Set([...SOUTH_AMERICA, ...MEXICO_CENTRAL_AMERICA_CARIBBEAN]);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const HOME_CITY_ID = '__home__';
const MAX_BUS_KM = 500;
const MODES: ReadonlySet<string> = new Set(['flight', 'train', 'boat', 'bus', 'car']);

export interface PriceNeed { key: string; kind: 'route' | 'hotel'; label: string }
export interface PricingPlan {
  needs: PriceNeed[];
  build(prices: Map<string, number>): Omit<CostEstimate, 'inputsHash' | 'calculatedAt'>;
}

// Shared shape for the route + hotel analysis done once in planPricing.
interface LegPlan {
  from: string | null;          // null = home
  to: string | null;
  mode: string;                 // TransitMode, or 'unknown' when no segment and coordinates are missing
  key: string | null;           // route cache key, null = cannot be priced
  label: string | null;
  isFlight: boolean;
  isGroup: boolean;             // car is priced per group
  southAmericaDeparture: boolean;
}

interface HotelPlan {
  cityId: string;
  nights: number;
  units: number;                // rooms, or beds when budget
  price: number | null;         // table price per unit per night (table cities)
  season: number;               // table season multiplier; 1 for DeepSeek answers (already month-specific)
  month: number;
  key: string | null;           // on-demand hotel price key (cities without a table)
}

// Own-property lookup so ids like "constructor" never hit Object.prototype.
function own<T>(table: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

export function roomCount(adults: number, children: number): number {
  const rooms = Math.ceil(adults / 2);
  const extraChildren = Math.max(0, children - 2 * rooms);
  return rooms + Math.ceil(extraChildren / 2);
}

function parseDmy(s: string | undefined): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s ?? '');
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return d.getUTCDate() === Number(m[1]) ? d : null;
}

function monthOf(s: string | undefined): number | null {
  const d = parseDmy(s);
  return d ? d.getUTCMonth() + 1 : null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Mode for a between-city leg with no segment: flight over 500 km, bus otherwise.
function defaultBetweenMode(from: string, to: string): string {
  const a = own(CITY_COORDS, from);
  const b = own(CITY_COORDS, to);
  if (!a || !b) return 'unknown';
  return distanceKm(a, b) > MAX_BUS_KM ? 'flight' : 'bus';
}

function cityLabel(cityId: string): string | null {
  return own(CITY_NAMES, cityId) ?? null;
}

// Binds the home ground key to the user-typed origin name (hashed, so the raw text never reaches the shared cache key).
// Two users with the same geonameId but different names get different keys; a fake name only poisons its own key.
function originNameHash(name: string): string {
  return createHash('sha256').update(name.trim().toLowerCase()).digest('hex').slice(0, 8);
}

function endpointKey(city: string | null, origin: Place | null, isFlight: boolean): string | null {
  if (city === null) return !origin ? null : isFlight ? origin.iata : `g${origin.geonameId}.${originNameHash(origin.name)}`;
  if (!cityLabel(city)) return null;
  if (!isFlight) return city;
  return own(CITY_AIRPORTS, city)?.iata ?? null;
}

// The user-typed origin name is free text that reaches the DeepSeek prompt: keep a plain place-name subset only.
function homeLabel(origin: Place): string {
  const name = origin.name.replace(/[^\p{L}\p{N} ,.'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  const short = Array.from(name).slice(0, 40).join('').trim();
  return short ? `${short}, ${origin.countryCode}` : `home city in ${origin.countryCode}`;
}

function endpointLabel(city: string | null, origin: Place | null, isFlight: boolean): string {
  if (city === null) {
    // Home end: flights show IATA only (the origin name stays out of flight labels); ground legs show the sanitized name.
    if (isFlight) return origin?.iata ?? '';
    return origin ? homeLabel(origin) : '';
  }
  const name = cityLabel(city) ?? city;
  if (!isFlight) return name;
  return `${own(CITY_AIRPORTS, city)?.iata ?? ''} (${name})`;
}

function makeLeg(args: {
  from: string | null; to: string | null; transit?: TransitLeg; fallbackDate?: string;
  defaultMode: string; origin: Place | null; comfort: ComfortLevel;
}): LegPlan {
  const { from, to, transit, fallbackDate, defaultMode, origin, comfort } = args;
  // ponytail: first segment's mode prices the whole leg; price per segment if multi-modal legs matter
  // The stored mode is unvalidated free text: only the five known modes may reach a price key or a DeepSeek label.
  const rawMode = transit?.segments[0]?.mode ?? defaultMode;
  const mode = MODES.has(rawMode) ? rawMode : 'unknown';
  const month = monthOf(transit?.date) ?? monthOf(transit?.segments[0]?.departureDate) ?? monthOf(fallbackDate);
  const isFlight = mode === 'flight';
  const isGroup = mode === 'car';
  const fromKey = endpointKey(from, origin, isFlight);
  const toKey = endpointKey(to, origin, isFlight);
  const cabin = isFlight ? (comfort === 'luxury' ? 'business' : 'economy') : '-';
  const key = mode !== 'unknown' && month !== null && fromKey && toKey
    ? `route:${fromKey}:${toKey}:${pad2(month)}:${mode}:${cabin}`
    : null;
  const fromLabel = endpointLabel(from, origin, isFlight);
  const toLabel = endpointLabel(to, origin, isFlight);
  const monthName = month === null ? '' : `, in ${MONTHS[month - 1]}`;
  const label = !key ? null
    : isFlight ? `one-way ${cabin} flight per adult, ${fromLabel} → ${toLabel}${monthName}`
    : isGroup ? `one-way car rental + fuel for the whole group, ${fromLabel} → ${toLabel}${monthName}`
    : `one-way ${mode} ticket per adult, ${fromLabel} → ${toLabel}${monthName}`;
  const departureCountry = from === null ? origin?.countryCode : own(CITY_AIRPORTS, from)?.country;
  return {
    from, to, mode, key, label, isFlight, isGroup,
    southAmericaDeparture: isFlight && !!departureCountry && SOUTH_AMERICA_ISO2.has(departureCountry),
  };
}

function legPlans(trip: Trip, settings: CostSettings): LegPlan[] {
  const { stops, transits } = trip;
  const origin = settings.origin;
  const first = stops[0]?.cityId;
  const last = stops[stops.length - 1]?.cityId;
  const plans: LegPlan[] = [];
  if (origin && first && own(CITY_AIRPORTS, first)?.iata !== origin.iata) {
    plans.push(makeLeg({
      from: null, to: first, transit: transits.find(t => t.fromCityId === '__start__'),
      fallbackDate: stops[0].checkIn, defaultMode: 'flight', origin, comfort: settings.comfort,
    }));
  }
  for (let i = 0; i + 1 < stops.length; i++) {
    const from = stops[i].cityId;
    const to = stops[i + 1].cityId;
    plans.push(makeLeg({
      from, to, transit: transits.find(t => t.fromCityId === from && t.toCityId === to),
      fallbackDate: stops[i].checkOut, defaultMode: defaultBetweenMode(from, to), origin, comfort: settings.comfort,
    }));
  }
  if (origin && last && own(CITY_AIRPORTS, last)?.iata !== origin.iata) {
    plans.push(makeLeg({
      from: last, to: null, transit: transits.find(t => t.toCityId === '__end__'),
      fallbackDate: stops[stops.length - 1].checkOut, defaultMode: 'flight', origin, comfort: settings.comfort,
    }));
  }
  return plans;
}

function hotelPlans(stops: TripStop[], settings: CostSettings, units: number): { plans: HotelPlan[]; unestimated: UnestimatedLeg[]; nights: number } {
  const plans: HotelPlan[] = [];
  const unestimated: UnestimatedLeg[] = [];
  let nights = 0;
  for (const s of stops) {
    const ci = parseDmy(s.checkIn);
    const co = parseDmy(s.checkOut);
    if (!ci || !co) {
      unestimated.push({ from: s.cityId, to: s.cityId, mode: 'hotel' });
      continue;
    }
    const n = Math.max(0, Math.round((co.getTime() - ci.getTime()) / 86400000));
    nights += n;
    if (n === 0) continue;
    const table = own(HOTEL_PRICES, s.cityId);
    if (table) {
      plans.push({ cityId: s.cityId, nights: n, units, price: table[settings.comfort], season: table.season[ci.getUTCMonth()], month: ci.getUTCMonth() + 1, key: null });
    } else if (cityLabel(s.cityId)) {
      const month = ci.getUTCMonth() + 1;
      plans.push({ cityId: s.cityId, nights: n, units, price: null, season: 1, month, key: `hotel:${s.cityId}:${settings.comfort}:${pad2(month)}` });
    } else {
      unestimated.push({ from: s.cityId, to: s.cityId, mode: 'hotel' });
    }
  }
  return { plans, unestimated, nights };
}

function hotelLabel(cityId: string, comfort: ComfortLevel, month: number): string {
  const what = comfort === 'budget' ? 'one hostel dorm bed'
    : comfort === 'luxury' ? 'a 5★ double room'
    : 'a 3–4★ double room (mid)';
  const country = own(CITY_AIRPORTS, cityId)?.country;
  return `nightly price of ${what} in ${cityLabel(cityId)}${country ? `, ${country}` : ''}, in ${MONTHS[month - 1]}`;
}

export function estimateInputsHash(trip: Trip, settings: CostSettings): string {
  const canonical = {
    stops: trip.stops.map(s => ({
      cityId: s.cityId,
      checkIn: s.checkIn,
      checkOut: s.checkOut,
      attractionIds: s.selectedAttractions.flatMap(a => (a.attractionId ? [a.attractionId] : [])),
    })),
    legs: trip.transits.map(l => ({
      fromCityId: l.fromCityId,
      toCityId: l.toCityId,
      date: l.date ?? null,
      segments: l.segments.map(seg => ({ mode: seg.mode, departureDate: seg.departureDate ?? null })),
    })),
    settings: {
      origin: settings.origin && {
        geonameId: settings.origin.geonameId,
        name: settings.origin.name,
        countryCode: settings.origin.countryCode,
        iata: settings.origin.iata,
      },
      adults: settings.adults,
      children: settings.children,
      // Only when > 0, so snapshots saved before infants existed keep their hash.
      ...(settings.infants ? { infants: settings.infants } : {}),
      comfort: settings.comfort,
    },
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

// Infants (settings.infants) are free on every line and need no room or bed, so pricing never reads them.
export function planPricing(trip: Trip, settings: CostSettings): PricingPlan {
  const { adults, children, comfort } = settings;
  const units = comfort === 'budget' ? adults + children : roomCount(adults, children);
  const personFactor = adults + 0.75 * children;
  const groupTicketFactor = adults + 0.5 * children;

  const legs = legPlans(trip, settings);
  const hotels = hotelPlans(trip.stops, settings, units);

  let ticketCount = 0;
  let unpricedTicketCount = 0;
  let ticketsRaw = 0;
  for (const s of trip.stops) {
    for (const a of s.selectedAttractions) {
      if (!a.attractionId) continue;
      ticketCount++;
      const price = own(TICKET_PRICES, a.attractionId);
      if (price === undefined) {
        if (a.category !== 'freetour') unpricedTicketCount++;   // freetours are tip-based: 0
        continue;
      }
      ticketsRaw += price * groupTicketFactor;
    }
  }

  const needs = new Map<string, PriceNeed>();
  for (const leg of legs) {
    if (leg.key && leg.label) needs.set(leg.key, { key: leg.key, kind: 'route', label: leg.label });
  }
  for (const h of hotels.plans) {
    if (h.key) {
      needs.set(h.key, { key: h.key, kind: 'hotel', label: hotelLabel(h.cityId, comfort, h.month) });
    }
  }

  return {
    needs: Array.from(needs.values()),
    build(prices) {
      const unestimated: UnestimatedLeg[] = [];
      let flightsRaw = 0;
      let groundRaw = 0;
      let lodgingRaw = 0;

      for (const leg of legs) {
        const price = leg.key ? prices.get(leg.key) : undefined;
        if (price === undefined) {
          unestimated.push({ from: leg.from ?? HOME_CITY_ID, to: leg.to ?? HOME_CITY_ID, mode: leg.mode });
          continue;
        }
        const amount = price * (leg.isGroup ? 1 : personFactor) * (leg.southAmericaDeparture ? SOUTH_AMERICA_FLIGHT_FACTOR : 1);
        if (leg.isFlight) flightsRaw += amount;
        else groundRaw += amount;
      }

      for (const h of hotels.plans) {
        const price = h.price ?? (h.key ? prices.get(h.key) : undefined);
        if (price === undefined) {
          unestimated.push({ from: h.cityId, to: h.cityId, mode: 'hotel' });
          continue;
        }
        lodgingRaw += h.nights * h.units * price * h.season;
      }
      unestimated.push(...hotels.unestimated);

      const flightsUsd = Math.round(flightsRaw);
      const lodgingUsd = Math.round(lodgingRaw);
      const ticketsUsd = Math.round(ticketsRaw);
      const groundUsd = Math.round(groundRaw);
      return {
        totalUsd: flightsUsd + lodgingUsd + ticketsUsd + groundUsd,
        flightsUsd,
        lodgingUsd,
        ticketsUsd,
        groundUsd,
        nights: hotels.nights,
        rooms: units,
        ticketCount,
        unpricedTicketCount,
        unestimated,
        missingOrigin: settings.origin === null,
        settings,
      };
    },
  };
}

export function isEstimateStale(trip: Trip): boolean {
  return !!trip.costEstimate
    && trip.costEstimate.inputsHash !== estimateInputsHash(trip, trip.costSettings ?? DEFAULT_COST_SETTINGS);
}
