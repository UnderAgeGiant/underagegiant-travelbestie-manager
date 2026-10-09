import { CITY_NAMES } from '../data/cities';

/** Lowercase + strip diacritics — mirrors the frontend's core/utils/normalize-search.util.ts (plus trim). */
export function normalizeSearch(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

const MIN_CITY_QUERY = 3;
const NORMALIZED_CITIES = Object.entries(CITY_NAMES).map(([id, name]) => [id, normalizeSearch(name)] as const);

/** Catalog city ids a shared-trip search should also match on (via trip_stops.city_id). */
export function matchCityIds(q: string): string[] {
  const n = normalizeSearch(q);
  if (n.length < MIN_CITY_QUERY) return [];
  const compact = n.replace(/\s+/g, '');
  return NORMALIZED_CITIES.filter(([id, name]) => name.includes(n) || id.includes(compact)).map(([id]) => id);
}

// ponytail: fixed Latin-1/Latin-Ext-A map for Postgres translate(); covers es/pt/fr/de/it titles.
// Upgrade path: CREATE EXTENSION unaccent + an immutable wrapper if non-Latin scripts ever matter.
export const SQL_ACCENT_FROM = 'áàâäãåéèêëíìîïóòôöõøúùûüñçýÿ';
export const SQL_ACCENT_TO   = 'aaaaaaeeeeiiiioooooouuuuncyy';
