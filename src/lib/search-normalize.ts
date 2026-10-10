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

// Built from normalizeSearch itself, so SQL translate() and the JS normalizer agree char-for-char
// over Latin-1 Supplement + Latin Extended-A/B (U+00C0–U+024F), upper and lower case — no collation dependence.
// Combining marks U+0300–U+036F go in FROM only: translate() deletes FROM chars with no TO counterpart (NFD-stored titles).
// ponytail: Latin scripts only; CREATE EXTENSION unaccent + an immutable wrapper if other scripts ever matter.
const accentFrom: string[] = [];
const accentTo: string[] = [];
for (let cp = 0xc0; cp <= 0x24f; cp++) {
  const ch = String.fromCodePoint(cp);
  const n = normalizeSearch(ch);
  if (n !== ch.toLowerCase() && /^[a-z]$/.test(n)) { accentFrom.push(ch); accentTo.push(n); }
}
for (let cp = 0x300; cp <= 0x36f; cp++) accentFrom.push(String.fromCodePoint(cp));
export const SQL_ACCENT_FROM = accentFrom.join('');
export const SQL_ACCENT_TO = accentTo.join('');
