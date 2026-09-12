/** Opaque pagination cursor for GET /karma/events — anchors a keyset query to
 *  the last row of the previous page (created_at + event_id tiebreaker),
 *  matching the karma_events_user_created_idx index directly instead of
 *  OFFSET-scanning past already-seen rows. */
export interface KarmaEventsCursor {
  createdAt: string; // ISO timestamp
  eventId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeKarmaEventsCursor(cursor: KarmaEventsCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeKarmaEventsCursor(raw: string): KarmaEventsCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' && parsed !== null &&
      typeof (parsed as Record<string, unknown>).createdAt === 'string' &&
      ((parsed as Record<string, unknown>).createdAt as string).length > 0 &&
      Number.isFinite(Date.parse((parsed as Record<string, unknown>).createdAt as string)) &&
      typeof (parsed as Record<string, unknown>).eventId === 'string' &&
      UUID_RE.test((parsed as Record<string, unknown>).eventId as string)
    ) {
      return {
        createdAt: (parsed as Record<string, unknown>).createdAt as string,
        eventId: (parsed as Record<string, unknown>).eventId as string,
      };
    }
    return null;
  } catch {
    return null;
  }
}
