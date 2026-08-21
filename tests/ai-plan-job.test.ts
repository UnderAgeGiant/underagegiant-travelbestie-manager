import { runAiPlanJob } from '../src/lib/ai-plan-job';
import { AiController } from '../src/controllers/ai.controller';
import { StubAiPlanRequestRepository, StubKarmaRepository, StubNotificationRepository } from './helpers/stubs';
import { PlanChangeResult } from '../src/types';
import { AiPlanBody } from '../src/schemas/ai.schemas';

jest.mock('../src/lib/deepseek', () => ({ deepseekClient: {} }));

jest.mock('../src/lib/redis', () => ({
  redis: { set: jest.fn().mockResolvedValue('OK'), get: jest.fn().mockResolvedValue(null) },
  planSessionKey: (userId: string, sessionId: string) => `plan:${userId}:${sessionId}`,
}));

function makeBody(overrides: Partial<AiPlanBody> = {}): AiPlanBody {
  return {
    selectedOption: { id: 1, title: 'Ruta Clásica por Europa', summary: 's', highlights: ['a'] },
    preferences: 'viaje romántico',
    duration: 10,
    budget: '1000 USD',
    startDate: '15/07/2026',
    planSessionId: 'session-1',
    ...overrides,
  } as AiPlanBody;
}

describe('runAiPlanJob', () => {
  let aiPlanRequests: StubAiPlanRequestRepository;
  let karma: StubKarmaRepository;
  let notifications: StubNotificationRepository;
  let ai: AiController;

  beforeEach(() => {
    aiPlanRequests = new StubAiPlanRequestRepository();
    karma = new StubKarmaRepository();
    notifications = new StubNotificationRepository();
    ai = new AiController();
  });

  it('marks the row completed and notifies ai_plan_ready on success', async () => {
    jest.spyOn(ai, 'generatePlan').mockResolvedValue({ title: 'Mi Plan Europa', stops: [], transits: [] });

    const body = makeBody();
    const record = await aiPlanRequests.insert({
      userId: 'u1', planSessionId: 'session-1', karmaCharged: 1,
      requestParams: { selectedOption: body.selectedOption, preferences: body.preferences, duration: body.duration, budget: body.budget, startDate: body.startDate },
    });
    const planChangeResult: PlanChangeResult = { type: 'new_session' };

    await runAiPlanJob(
      { ai, aiPlanRequests, karma, notifications },
      { requestId: record.requestId, userId: 'u1', flowId: 'flow-1', body, planChangeResult, karmaCharged: 1 },
    );

    const updated = await aiPlanRequests.findById(record.requestId);
    expect(updated?.status).toBe('completed');
    expect(updated?.result?.title).toBe('Mi Plan Europa');
    expect(updated?.changeInfo).toMatchObject({ type: 'new_session' });

    const notified = await notifications.listByUser('u1');
    expect(notified).toHaveLength(1);
    expect(notified[0].type).toBe('ai_plan_ready');
    expect(notified[0].body).toContain('Mi Plan Europa');
    expect(karma.awarded).toHaveLength(0);   // no refund on success
  });

  it('marks the row failed, refunds karma, and notifies ai_plan_failed on error', async () => {
    jest.spyOn(ai, 'generatePlan').mockRejectedValue(new Error('DeepSeek timed out'));

    const body = makeBody();
    const record = await aiPlanRequests.insert({
      userId: 'u1', planSessionId: 'session-1', karmaCharged: 1,
      requestParams: { selectedOption: body.selectedOption, preferences: body.preferences, duration: body.duration, budget: body.budget, startDate: body.startDate },
    });
    const planChangeResult: PlanChangeResult = { type: 'new_session' };

    await runAiPlanJob(
      { ai, aiPlanRequests, karma, notifications },
      { requestId: record.requestId, userId: 'u1', flowId: 'flow-1', body, planChangeResult, karmaCharged: 1 },
    );

    const updated = await aiPlanRequests.findById(record.requestId);
    expect(updated?.status).toBe('failed');
    expect(updated?.errorMessage).toContain('DeepSeek timed out');

    expect(karma.awarded).toEqual([{ userId: 'u1', amount: 1, reason: 'ai_plan_refund', refId: record.requestId }]);

    const notified = await notifications.listByUser('u1');
    expect(notified).toHaveLength(1);
    expect(notified[0].type).toBe('ai_plan_failed');
    expect(notified[0].body).toContain('Ruta Clásica por Europa');
    expect(notified[0].body).toContain('1 karma');
  });

  it('does not refund karma on failure when karmaCharged is 0 (a free_change)', async () => {
    jest.spyOn(ai, 'generatePlan').mockRejectedValue(new Error('DeepSeek timed out'));

    const body = makeBody();
    const record = await aiPlanRequests.insert({
      userId: 'u1', planSessionId: 'session-1', karmaCharged: 0,
      requestParams: { selectedOption: body.selectedOption, preferences: body.preferences, duration: body.duration, budget: body.budget, startDate: body.startDate },
    });
    const planChangeResult: PlanChangeResult = {
      type: 'free_change', freeChangesUsed: 0, freeChangesRemaining: 2,
      originalOptions: { selectedOptionTitle: 't', selectedOptionSummary: 's', selectedOptionHighlights: [], preferences: 'p', duration: 0, budget: '', startDate: '' },
    };

    await runAiPlanJob(
      { ai, aiPlanRequests, karma, notifications },
      { requestId: record.requestId, userId: 'u1', flowId: 'flow-1', body, planChangeResult, karmaCharged: 0 },
    );

    expect(karma.awarded).toHaveLength(0);
    const notified = await notifications.listByUser('u1');
    expect(notified[0].body).not.toContain('karma');
    expect(notified[0].body).toContain('Puedes intentarlo de nuevo');
  });
});
