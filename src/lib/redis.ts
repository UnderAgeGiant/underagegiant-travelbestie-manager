import Redis from 'ioredis';
import { createHash } from 'crypto';

// In production, point REDIS_URL to an Upstash TLS endpoint:
//   rediss://:<password>@<host>:6380
// In local dev, point to a local Redis: redis://127.0.0.1:6379
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

export const redis = new Redis(REDIS_URL, {
  connectTimeout: 5000,        // give Vercel cold starts time to connect
  commandTimeout: 3000,        // bound individual command wait
  maxRetriesPerRequest: 1,     // one retry then throw
});

// Silence unhandled error events so a Redis outage doesn't crash the process.
// The middlewares catch errors and fall back to "new_session" behaviour.
redis.on('error', () => { /* swallowed intentionally */ });

/**
 * Redis key for a user's plan change session.
 * Format: plan:{userId}:{sha256(planSessionId)}
 */
export function planSessionKey(userId: string, planSessionId: string): string {
  const hash = createHash('sha256').update(planSessionId).digest('hex');
  return `plan:${userId}:${hash}`;
}

export function commentCooldownKey(userId: string): string {
  return `comment:cooldown:${userId}`;
}

export function commentLastTextKey(userId: string): string {
  return `comment:last:${userId}`;
}

export function commentCacheKey(attractionId: string): string {
  return `comments:att:${attractionId}`;
}

export const COMMENT_CACHE_TTL = 60;

export function notificationStatusKey(userId: string): string {
  return `notif:status:${userId}`;
}

// Correctness comes from invalidate-on-write (add/markAllRead/setMuted), not this TTL —
// it's only a safety net for a missed invalidation. Set well above the 60 s poll interval
// so normal continuous polling never expires mid-session; 90 s would miss on every other poll.
export const NOTIFICATION_STATUS_CACHE_TTL = 600;

/**
 * Redis key for "has this identity seen this highlight tour". identity is `u:{userId}` for
 * a logged-in caller, `a:{anonymousId}` for an anonymous one carrying a client-generated
 * id, or `ip:{req.ip}` as the last resort (see src/lib/highlight-identity.ts).
 */
export function highlightSeenKey(highlightType: string, identity: string): string {
  return `highlight:${highlightType}:${identity}`;
}

// Mirrors the login session's own lifetime (see REFRESH_TTL in lib/refresh-tokens.ts,
// 86400s/1 day) so a highlight "seen" flag in Redis never outlives the session it was
// recorded during — Postgres (PgHighlightRepository) is the actually-permanent record for
// logged-in users; this is only ever the fast-path cache in front of it (or, for an
// anonymous/IP identity, the only record there is at all). Independently configurable
// rather than reusing REFRESH_TTL directly, since the two are conceptually separate knobs.
export const HIGHLIGHT_SEEN_TTL_SECONDS = Number(process.env.HIGHLIGHT_SEEN_TTL_SECONDS ?? 86400);

/** Sets the "seen" flag at `key` (see highlightSeenKey), expiring after
 *  HIGHLIGHT_SEEN_TTL_SECONDS. The one place that issues the SET for every highlights
 *  code path, so the TTL can't drift out of sync between them. */
export async function markHighlightSeenInRedis(key: string): Promise<void> {
  await redis.set(key, '1', 'EX', HIGHLIGHT_SEEN_TTL_SECONDS);
}

/**
 * Redis key for "how many times has this identity dismissed this highlight tour without
 * confirming it" (closed via ✕/Escape/etc., never clicked the final "¡Entendido!"). Kept
 * entirely separate from highlightSeenKey — a dismissal must never itself flip the "seen"
 * flag; only crossing HIGHLIGHT_DISMISS_LIMIT does (see mark-highlight-dismissed.middleware.ts).
 */
export function highlightDismissKey(highlightType: string, identity: string): string {
  return `highlight:${highlightType}:${identity}:dismissed`;
}

// After this many dismissals without an explicit "¡Entendido!" confirmation, stop trying —
// escalate to the same permanent "seen" state a real confirmation would produce. Balances
// "don't punish someone who genuinely dismissed once by accident" against "don't nag someone
// who's clearly not interested."
export const HIGHLIGHT_DISMISS_LIMIT = 3;

/** Increments the dismiss counter at `key` (see highlightDismissKey) and refreshes its TTL
 *  to HIGHLIGHT_SEEN_TTL_SECONDS on every call (same sliding-window behavior as
 *  markHighlightSeenInRedis) — a dismiss counter that quietly expired mid-count would let
 *  the same visitor "reset" past the limit just by waiting. Returns the new count. */
export async function incrementHighlightDismissCount(key: string): Promise<number> {
  const count = await redis.incr(key);
  await redis.expire(key, HIGHLIGHT_SEEN_TTL_SECONDS);
  return count;
}

/**
 * Every highlight type a given identity (e.g. `a:{anonymousId}`) has been marked "seen"
 * for. Used only at login/register time to migrate an anonymous visitor's seen-state onto
 * their new `u:{userId}` identity (see migrate-anonymous-highlights.middleware.ts) — not a
 * hot path, so a cursor-based SCAN (non-blocking, unlike KEYS) is worth the extra
 * round-trips even though the `highlight:*:{identity}` pattern can't use a key-space
 * prefix shortcut (the wildcard sits before the fixed suffix, not after it).
 *
 * Deliberately does NOT match highlightDismissKey's `...{identity}:dismissed` keys — the
 * pattern has no trailing `*`, so it requires the key to end exactly with `{identity}`.
 * See findHighlightDismissCountsFor below for the (separate) dismiss-count equivalent.
 */
export async function findHighlightTypesFor(identity: string): Promise<string[]> {
  const pattern = `highlight:*:${identity}`;
  const suffixLength = `:${identity}`.length;
  const types = new Set<string>();
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = next;
    for (const key of keys) {
      types.add(key.slice('highlight:'.length, key.length - suffixLength));
    }
  } while (cursor !== '0');
  return [...types];
}

/**
 * Every highlight type a given identity has an in-progress (not-yet-escalated) dismiss
 * count for, with that count. Same "essentially the same user" migration reasoning as
 * findHighlightTypesFor above, just for a partial dismiss count instead of a completed
 * "seen" flag — without this, an anonymous visitor who dismissed the tour once or twice and
 * then logs in would silently lose that progress and get HIGHLIGHT_DISMISS_LIMIT fresh
 * chances all over again under their new `u:{userId}` identity. Same cursor-based SCAN
 * choice (not a hot path), matched against highlightDismissKey's `...{identity}:dismissed`
 * suffix specifically so it can't also pick up plain "seen" keys.
 */
export async function findHighlightDismissCountsFor(identity: string): Promise<Array<{ type: string; count: number }>> {
  const suffix = `:${identity}:dismissed`;
  const pattern = `highlight:*${suffix}`;
  const results: Array<{ type: string; count: number }> = [];
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = next;
    for (const key of keys) {
      const type = key.slice('highlight:'.length, key.length - suffix.length);
      const raw = await redis.get(key);
      const count = raw ? parseInt(raw, 10) : 0;
      if (count > 0) results.push({ type, count });
    }
  } while (cursor !== '0');
  return results;
}

/** Adds `by` to the dismiss counter at `key` (see highlightDismissKey) and refreshes its
 *  TTL — same sliding-window behavior as incrementHighlightDismissCount, but for carrying
 *  an existing count forward (e.g. an anonymous→logged-in migration) rather than a plain
 *  +1. Returns the new total. */
export async function addToHighlightDismissCount(key: string, by: number): Promise<number> {
  const count = await redis.incrby(key, by);
  await redis.expire(key, HIGHLIGHT_SEEN_TTL_SECONDS);
  return count;
}
