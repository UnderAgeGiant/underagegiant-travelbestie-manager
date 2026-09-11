/** Opaque pagination cursor for GET /karma/events — anchors a keyset query to
 *  the last row of the previous page (created_at + event_id tiebreaker),
 *  matching the karma_events_user_created_idx index directly instead of
 *  OFFSET-scanning past already-seen rows. */
export interface KarmaEventsCursor {
  createdAt: string; // ISO timestamp
  eventId: string;
}

export function encodeKarmaEventsCursor(cursor: KarmaEventsCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64');
}

export function decodeKarmaEventsCursor(raw: string): KarmaEventsCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    if (
      typeof parsed === 'object' && parsed !== null &&
      typeof (parsed as Record<string, unknown>).createdAt === 'string' &&
      ((parsed as Record<string, unknown>).createdAt as string).length > 0 &&
      typeof (parsed as Record<string, unknown>).eventId === 'string' &&
      ((parsed as Record<string, unknown>).eventId as string).length > 0
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
