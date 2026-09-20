import { encodeFeedCursor, decodeFeedCursor } from '../../src/lib/feed-cursor';

const TRIP = '11111111-1111-4111-8111-111111111111';
const PG_TS = '2026-09-19 12:34:56.123456+00';

describe('feed cursor', () => {
  it('round-trips, preserving microsecond precision', () => {
    const c = { favoriteCount: 7, createdAt: PG_TS, tripId: TRIP };
    expect(decodeFeedCursor(encodeFeedCursor(c))).toEqual(c);
  });

  it('accepts an ISO timestamp too (used by the in-memory stub)', () => {
    const c = { favoriteCount: 0, createdAt: '2026-09-19T12:34:56.123Z', tripId: TRIP };
    expect(decodeFeedCursor(encodeFeedCursor(c))).toEqual(c);
  });

  it('rejects garbage, empty and wrong-shape input', () => {
    expect(decodeFeedCursor('not base64 json!!!')).toBeNull();
    expect(decodeFeedCursor('')).toBeNull();
    const wrong = Buffer.from(JSON.stringify({ a: 1 })).toString('base64url');
    expect(decodeFeedCursor(wrong)).toBeNull();
  });

  it('rejects a negative or non-integer favoriteCount', () => {
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    expect(decodeFeedCursor(enc({ favoriteCount: -1, createdAt: PG_TS, tripId: TRIP }))).toBeNull();
    expect(decodeFeedCursor(enc({ favoriteCount: 1.5, createdAt: PG_TS, tripId: TRIP }))).toBeNull();
  });

  it('rejects a non-uuid tripId and a non-timestamp createdAt (no SQL-ish strings reach the query)', () => {
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    expect(decodeFeedCursor(enc({ favoriteCount: 1, createdAt: PG_TS, tripId: 'abc' }))).toBeNull();
    expect(decodeFeedCursor(enc({ favoriteCount: 1, createdAt: "2026-01-01'; DROP TABLE trips;--", tripId: TRIP }))).toBeNull();
  });
});
