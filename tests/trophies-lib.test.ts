import { tiersReached, trophyLabel, exposeNewTrophies, NEW_TROPHIES_HEADER, TROPHY_THRESHOLDS } from '../src/lib/trophies';

describe('trophy catalog', () => {
  it('tiersReached returns every tier whose threshold is met', () => {
    expect(tiersReached('ai_plans', 0)).toEqual([]);
    expect(tiersReached('ai_plans', 1)).toEqual(['bronze']);
    expect(tiersReached('ai_plans', 10)).toEqual(['bronze', 'silver']);
    expect(tiersReached('ai_plans', 50)).toEqual(['bronze', 'silver', 'gold']);
    expect(tiersReached('comments', 19)).toEqual(['bronze']);
    expect(tiersReached('comments', 70)).toEqual(['bronze', 'silver', 'gold']);
    expect(tiersReached('clones', 5)).toEqual(['bronze', 'silver']);
  });

  it('single trophies reach "single" at 1', () => {
    expect(tiersReached('share_plan', 1)).toEqual(['single']);
    expect(tiersReached('plan_visited', 3)).toEqual(['single']);
  });

  it('thresholds match the spec', () => {
    expect(TROPHY_THRESHOLDS.favorites).toEqual({ bronze: 1, silver: 10, gold: 50 });
    expect(TROPHY_THRESHOLDS.clones).toEqual({ bronze: 1, silver: 5, gold: 10 });
  });

  it('trophyLabel appends the tier only for tiered trophies', () => {
    expect(trophyLabel('ai_plans', 'gold')).toBe('Mejor planeador con IA — Oro');
    expect(trophyLabel('excel_export', 'single')).toBe('Itinerario en papel');
  });

  it('exposeNewTrophies sets the header only for a non-empty list', () => {
    const res = { setHeader: jest.fn() } as any;
    exposeNewTrophies(res, []);
    expect(res.setHeader).not.toHaveBeenCalled();
    const list = [{ type: 'share_plan' as const, tier: 'single' as const, earnedAt: '2026-10-01T00:00:00.000Z' }];
    exposeNewTrophies(res, list);
    expect(res.setHeader).toHaveBeenCalledWith(NEW_TROPHIES_HEADER, JSON.stringify(list));
  });
});
