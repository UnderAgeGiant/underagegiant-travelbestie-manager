// Framework-free date helpers shared by the weather feature (query validation,
// the weather controller, and open-meteo.ts). Internally everything is ISO
// yyyy-mm-dd (sortable, unambiguous, matches Open-Meteo's own date format) —
// only the app's own GET /weather request/response boundary uses dd/mm/yyyy,
// matching every other endpoint in this codebase.

/** dd/mm/yyyy -> yyyy-mm-dd */
export function dmyToISO(dmy: string): string {
  const [d, m, y] = dmy.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** yyyy-mm-dd -> dd/mm/yyyy */
export function isoToDMY(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** True if a dd/mm/yyyy string names a real calendar date (rejects e.g. 31/02/2026 —
 *  a shape-valid but non-existent date that Date.UTC would otherwise silently roll
 *  over into a different, real date rather than rejecting). */
export function isValidDMY(dmy: string): boolean {
  const [d, m, y] = dmy.split('/').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Adds (or subtracts, for a negative value) whole days to an ISO date string. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Every ISO date from startISO to endISO, inclusive. */
export function iterateISODates(startISO: string, endISO: string): string[] {
  const dates: string[] = [];
  let cur = startISO;
  while (cur <= endISO) {
    dates.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return dates;
}

/** Today's date (server clock, UTC) as yyyy-mm-dd. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
