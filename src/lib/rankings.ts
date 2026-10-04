/** Feature 70 — weekly rankings. Week = Monday 00:00 → Sunday 23:59:59, America/Santiago. */
export const RANKINGS_TZ = 'America/Santiago';
export const RANKINGS_TOP_N = 3;
export const RANKINGS_CACHE_TTL = 7200; // 2 h — recomputed lazily by the first request after expiry (no cron)

/** 'YYYY-MM-DD' of the Monday that starts `now`'s week in Santiago. Mirrored in the frontend's week-start.util.ts. */
export function santiagoWeekStart(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: RANKINGS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const d = new Date(`${local}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // back to Monday
  return d.toISOString().slice(0, 10);
}

export const rankingsKey   = (weekStart: string): string => `rankings:${weekStart}`;
export const myRankingsKey = (weekStart: string, userId: string): string => `rankings:me:${weekStart}:${userId}`;
