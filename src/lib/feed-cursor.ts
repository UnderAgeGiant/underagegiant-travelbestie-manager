/** Opaque pagination cursor for GET /feed — anchors a keyset query to the last row of
 *  the previous page. The three fields mirror the feed's total sort order
 *  (favorite_count DESC, created_at DESC, trip_id DESC). `createdAt` is Postgres' own
 *  full-precision timestamptz text (`created_at::text`), NOT a JS Date/ISO string: a Date
 *  truncates microseconds to milliseconds and could make the next page skip a sibling
 *  row created within the same millisecond. */
export interface FeedCursor {
  favoriteCount: number;
  createdAt: string;
  tripId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// '2026-09-19 12:34:56.123456+00' (Postgres text) or '2026-09-19T12:34:56.123Z' (ISO)
const TS_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:\d{2})?)$/;
const MAX_FAVORITES = 2_147_483_647;

export function encodeFeedCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeFeedCursor(raw: string): FeedCursor | null {
  try {
    const p = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (
      typeof p === 'object' && p !== null &&
      typeof p.favoriteCount === 'number' && Number.isInteger(p.favoriteCount) &&
      p.favoriteCount >= 0 && p.favoriteCount <= MAX_FAVORITES &&
      typeof p.createdAt === 'string' && p.createdAt.length <= 40 && TS_RE.test(p.createdAt) &&
      typeof p.tripId === 'string' && UUID_RE.test(p.tripId)
    ) {
      return { favoriteCount: p.favoriteCount, createdAt: p.createdAt, tripId: p.tripId };
    }
    return null;
  } catch {
    return null;
  }
}
