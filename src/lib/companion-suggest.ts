// Feature 54 — periodic, unprompted "Asistente Miel" companion-attraction nudges.
// All four constants are env-overridable so they can be tuned in production without
// a redeploy — COMPANION_BOOST_DURATION_SECONDS included, since a short override
// (e.g. 60) is the easiest way to manually verify the profile-page countdown timer
// without waiting 24 real hours (see Task 15's manual smoke test).
export const COMPANION_SUGGEST_CHANCE_DEFAULT  = Number(process.env.COMPANION_SUGGEST_CHANCE ?? 0.20);
export const COMPANION_SUGGEST_CHANCE_BOOSTED  = Number(process.env.COMPANION_SUGGEST_CHANCE_BOOSTED ?? 0.75);
export const COMPANION_BOOST_KARMA_COST        = 2;
export const COMPANION_SUGGEST_RATE_LIMIT      = 15; // requests / hour / user
export const COMPANION_BOOST_DURATION_SECONDS  = Number(process.env.COMPANION_BOOST_DURATION_SECONDS ?? 86400); // 24 hours

export function companionBoostKey(userId: string): string {
  return `companion:boost:${userId}`;
}
