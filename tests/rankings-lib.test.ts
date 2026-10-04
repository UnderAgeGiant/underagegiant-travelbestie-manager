import { santiagoWeekStart, rankingsKey, myRankingsKey, RANKINGS_TOP_N, RANKINGS_CACHE_TTL } from '../src/lib/rankings';

describe('santiagoWeekStart', () => {
  // Oct 2026: Chile is on DST (UTC-3). Monday 2026-10-05 00:00 Santiago = 03:00Z.
  it('Sunday 23:59:59 Santiago still belongs to the previous week', () => {
    expect(santiagoWeekStart(new Date('2026-10-05T02:59:59Z'))).toBe('2026-09-28');
  });
  it('Monday 00:00 Santiago starts a new week', () => {
    expect(santiagoWeekStart(new Date('2026-10-05T03:00:00Z'))).toBe('2026-10-05');
  });
  it('a mid-week instant maps to that Monday', () => {
    expect(santiagoWeekStart(new Date('2026-10-08T15:00:00Z'))).toBe('2026-10-05');
  });
  it('uses Santiago, not UTC: Monday 01:00Z is still Sunday in Santiago', () => {
    expect(santiagoWeekStart(new Date('2026-10-05T01:00:00Z'))).toBe('2026-09-28');
  });
  it('works in winter time (UTC-4): Monday 2026-07-06 00:00 Santiago = 04:00Z', () => {
    expect(santiagoWeekStart(new Date('2026-07-06T03:59:59Z'))).toBe('2026-06-29');
    expect(santiagoWeekStart(new Date('2026-07-06T04:00:00Z'))).toBe('2026-07-06');
  });
});

describe('ranking constants', () => {
  it('top 3, 2 h TTL, week-scoped keys', () => {
    expect(RANKINGS_TOP_N).toBe(3);
    expect(RANKINGS_CACHE_TTL).toBe(7200);
    expect(rankingsKey('2026-09-28')).toBe('rankings:2026-09-28');
    expect(myRankingsKey('2026-09-28', 'u1')).toBe('rankings:me:2026-09-28:u1');
  });
});
