import { buildPlanChangeInfo } from '../src/lib/plan-change-detector';
import { PlanChangeResult } from '../src/types';

describe('buildPlanChangeInfo', () => {
  it('returns new_session info with full free changes remaining', () => {
    const result: PlanChangeResult = { type: 'new_session' };
    expect(buildPlanChangeInfo(result)).toEqual({
      type: 'new_session', freeChangesUsed: 0, freeChangesRemaining: 3,
    });
  });

  it('increments freeChangesUsed by one for a free_change', () => {
    const result: PlanChangeResult = {
      type: 'free_change', freeChangesUsed: 1, freeChangesRemaining: 1,
      originalOptions: { selectedOptionTitle: 't', selectedOptionSummary: 's', selectedOptionHighlights: [], preferences: 'p', duration: 0, budget: '', startDate: '' },
    };
    expect(buildPlanChangeInfo(result)).toEqual({
      type: 'free_change', freeChangesUsed: 2, freeChangesRemaining: 1,
    });
  });

  it('zeroes freeChangesRemaining and carries the reason for a charged_change', () => {
    const result: PlanChangeResult = {
      type: 'charged_change', reason: 'major_change', freeChangesUsed: 3,
      originalOptions: { selectedOptionTitle: 't', selectedOptionSummary: 's', selectedOptionHighlights: [], preferences: 'p', duration: 0, budget: '', startDate: '' },
    };
    expect(buildPlanChangeInfo(result)).toEqual({
      type: 'charged_change', freeChangesUsed: 3, freeChangesRemaining: 0, reason: 'major_change',
    });
  });
});
