import { makeAttachAiPlanTrophies } from '../src/middleware/ai/attach-ai-plan-trophies.middleware';
import { StubTrophyRepository } from './helpers/stubs';

function run(mw: any, record: object) {
  const res = { setHeader: jest.fn() } as any;
  const next = jest.fn();
  return mw({ aiPlanRequest: record } as any, res, next).then(() => ({ res, next }));
}

describe('attachAiPlanTrophies', () => {
  it('exposes ai_plans trophies earned since the request was created, once completed', async () => {
    const repo = new StubTrophyRepository();
    repo.earned.push({ userId: 'u1', type: 'ai_plans', tier: 'bronze', earnedAt: '2026-10-01T10:05:00.000Z' });
    const { res, next } = await run(makeAttachAiPlanTrophies(repo),
      { status: 'completed', userId: 'u1', karmaCharged: 1, createdAt: '2026-10-01T10:00:00.000Z' });
    expect(res.setHeader).toHaveBeenCalledWith('X-New-Trophies', expect.stringContaining('"ai_plans"'));
    expect(next).toHaveBeenCalled();
  });

  it('does nothing for pending, free, or without a repo', async () => {
    const repo = new StubTrophyRepository();
    repo.earned.push({ userId: 'u1', type: 'ai_plans', tier: 'bronze', earnedAt: '2026-10-01T10:05:00.000Z' });
    for (const [mw, rec] of [
      [makeAttachAiPlanTrophies(repo), { status: 'pending', userId: 'u1', karmaCharged: 1, createdAt: '2026-10-01T10:00:00.000Z' }],
      [makeAttachAiPlanTrophies(repo), { status: 'completed', userId: 'u1', karmaCharged: 0, createdAt: '2026-10-01T10:00:00.000Z' }],
      [makeAttachAiPlanTrophies(undefined), { status: 'completed', userId: 'u1', karmaCharged: 1, createdAt: '2026-10-01T10:00:00.000Z' }],
    ] as const) {
      const { res, next } = await run(mw, rec);
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    }
  });
});
