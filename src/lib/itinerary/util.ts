import { CITY_NAMES } from '../../data/cities';
import { CostEstimate } from '../../types';
import { ItineraryLabels } from './labels';

/** Fills {name} placeholders in a label template. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function resolveCityName(cityId: string, l: ItineraryLabels, overrides?: Record<string, string>): string {
  if (cityId === '__start__') return l.origin;
  if (cityId === '__end__') return l.destination;
  return overrides?.[cityId] ?? CITY_NAMES[cityId] ?? cityId;
}

export function parseDMY(dmy: string): Date {
  const [d, m, y] = dmy.split('/');
  return new Date(Date.UTC(+y, +m - 1, +d));
}

export function dateKey(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getUTCFullYear()}`;
}

/** dd/mm/yyyy → sortable yyyymmdd. */
export const sortKey = (dmy: string): string => dmy.split('/').reverse().join('');

export function shortDate(dmy: string): string {
  return dmy.slice(0, 5);
}

export function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 86400000);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.max(0, Math.round((parseDMY(checkOut).getTime() - parseDMY(checkIn).getTime()) / 86400000));
}

function parseDateTime(dmy: string, hm: string): number {
  const [d, m, y] = dmy.split('/').map(Number);
  const [hh, mi] = hm.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mi);
}

export function computeSegmentMinutes(seg: { departureDate: string; departureTime: string; arrivalDate: string; arrivalTime: string }): number {
  const dep = parseDateTime(seg.departureDate, seg.departureTime);
  const arr = parseDateTime(seg.arrivalDate, seg.arrivalTime);
  return Math.max(0, Math.round((arr - dep) / 60000));
}

export function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  return h > 0 ? `${h}h` : `${m}m`;
}

export function plural(n: number, one: string, many: string): string {
  return fmt(n === 1 ? one : many, { n });
}

// ponytail: fixed to Chile time (the main market); take a timeZone from the export body if non-Chile users need it.
const CL_DATE = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' });

/** Timestamp → dd/mm/yyyy in Chile time (a "calculated on" date, not a trip day). */
export function isoToDMYDate(when: string | Date): string {
  return CL_DATE.format(new Date(when));
}

/** Travelers line, e.g. "2 adultos · 1 niño". */
export function travelersLine(s: { adults: number; children: number; infants: number }, l: ItineraryLabels): string {
  return [
    plural(s.adults, l.adultOne, l.adultMany),
    s.children ? plural(s.children, l.childOne, l.childMany) : '',
    s.infants ? plural(s.infants, l.infantOne, l.infantMany) : '',
  ].filter(Boolean).join(' · ');
}

/** The four stored cost categories in display order. */
export function costCategories(e: CostEstimate, l: ItineraryLabels): Array<{ key: 'flights' | 'lodging' | 'tickets' | 'ground'; label: string; usd: number }> {
  return [
    { key: 'flights', label: l.costFlights, usd: e.flightsUsd },
    { key: 'lodging', label: l.costLodging, usd: e.lodgingUsd },
    { key: 'tickets', label: l.costTickets, usd: e.ticketsUsd },
    { key: 'ground', label: l.costGround, usd: e.groundUsd },
  ];
}
