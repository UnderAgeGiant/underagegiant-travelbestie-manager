import { runAiPlanJob } from '../src/lib/ai-plan-job';
import { AiController } from '../src/controllers/ai.controller';
import { StubAiPlanRequestRepository, StubKarmaRepository, StubNotificationRepository, StubTrophyRepository, StubUserRepository, StubTripRepository } from './helpers/stubs';
import { PlanChangeResult } from '../src/types';
import { AiPlanBody } from '../src/schemas/ai.schemas';
import { TrophyRecorder } from '../src/lib/trophy-recorder';
import { capture } from '../src/lib/analytics';

jest.mock('../src/lib/analytics', () => ({ capture: jest.fn(), alias: jest.fn() }));

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
      requestId: 'req-1', userId: 'u1', planSessionId: 'session-1', karmaCharged: 1,
      requestParams: { selectedOption: body.selectedOption, preferences: body.preferences ?? '', duration: body.duration, budget: body.budget, startDate: body.startDate },
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
    expect(notified[0].url).toBe(`/my-trips?tab=aiplans&focus=${encodeURIComponent(record.requestId)}`);
    expect(notified[0].body).toContain('Mi Plan Europa');
    expect(karma.awarded).toHaveLength(0);   // no refund on success
    expect(ai.generatePlan).toHaveBeenCalledWith(body, 'u1');
  });

  it('marks the row failed, refunds karma, and notifies ai_plan_failed on error', async () => {
    jest.spyOn(ai, 'generatePlan').mockRejectedValue(new Error('DeepSeek timed out'));

    const body = makeBody();
    const record = await aiPlanRequests.insert({
      requestId: 'req-2', userId: 'u1', planSessionId: 'session-1', karmaCharged: 1,
      requestParams: { selectedOption: body.selectedOption, preferences: body.preferences ?? '', duration: body.duration, budget: body.budget, startDate: body.startDate },
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
    expect(notified[0].url).toBe(`/my-trips?tab=aiplans&focus=${encodeURIComponent(record.requestId)}`);
    expect(notified[0].body).toContain('Ruta Clásica por Europa');
    expect(notified[0].body).toContain('1 karma');
  });

  it('does not refund karma on failure when karmaCharged is 0 (a free_change)', async () => {
    jest.spyOn(ai, 'generatePlan').mockRejectedValue(new Error('DeepSeek timed out'));

    const body = makeBody();
    const record = await aiPlanRequests.insert({
      requestId: 'req-3', userId: 'u1', planSessionId: 'session-1', karmaCharged: 0,
      requestParams: { selectedOption: body.selectedOption, preferences: body.preferences ?? '', duration: body.duration, budget: body.budget, startDate: body.startDate },
    });
    const planChangeResult: PlanChangeResult = {
      type: 'free_change', freeChangesUsed: 0, freeChangesRemaining: 2,
      originalOptions: { selectedOptionTitle: 't', selectedOptionSummary: 's', selectedOptionHighlights: [], preferences: 'p', duration: 0, budget: '', startDate: '', cityIds: [] },
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

  it('records an ai_plans trophy event for a paid successful plan', async () => {
    jest.spyOn(ai, 'generatePlan').mockResolvedValue({ title: 'P', stops: [], transits: [] });
    const trophyRepo = new StubTrophyRepository();
    const trophies = new TrophyRecorder(trophyRepo, notifications);
    const body = makeBody();
    const record = await aiPlanRequests.insert({
      requestId: 'req-t1', userId: 'u1', planSessionId: 'session-1', karmaCharged: 1,
      requestParams: { selectedOption: body.selectedOption, preferences: body.preferences ?? '', duration: body.duration, budget: body.budget, startDate: body.startDate },
    });
    await runAiPlanJob(
      { ai, aiPlanRequests, karma, notifications, trophies },
      { requestId: record.requestId, userId: 'u1', flowId: 'f', body, planChangeResult: { type: 'new_session' }, karmaCharged: 1 },
    );
    expect(trophyRepo.events).toEqual([expect.objectContaining({ userId: 'u1', type: 'ai_plans', refId: 'req-t1' })]);
  });

  it('does not count free re-plans or failed plans', async () => {
    const trophyRepo = new StubTrophyRepository();
    const trophies = new TrophyRecorder(trophyRepo, notifications);
    const body = makeBody();
    const params = { selectedOption: body.selectedOption, preferences: body.preferences ?? '', duration: body.duration, budget: body.budget, startDate: body.startDate };

    jest.spyOn(ai, 'generatePlan').mockResolvedValueOnce({ title: 'P', stops: [], transits: [] });
    await aiPlanRequests.insert({ requestId: 'free', userId: 'u1', planSessionId: 's', karmaCharged: 0, requestParams: params });
    await runAiPlanJob({ ai, aiPlanRequests, karma, notifications, trophies },
      { requestId: 'free', userId: 'u1', flowId: 'f', body, planChangeResult: { type: 'free_change', freeChangesUsed: 0, freeChangesRemaining: 2, originalOptions: { selectedOptionTitle: 't', selectedOptionSummary: 's', selectedOptionHighlights: [], preferences: 'p', duration: 0, budget: '', startDate: '', cityIds: [] } } as any, karmaCharged: 0 });

    jest.spyOn(ai, 'generatePlan').mockRejectedValueOnce(new Error('boom'));
    await aiPlanRequests.insert({ requestId: 'fail', userId: 'u1', planSessionId: 's', karmaCharged: 1, requestParams: params });
    await runAiPlanJob({ ai, aiPlanRequests, karma, notifications, trophies },
      { requestId: 'fail', userId: 'u1', flowId: 'f', body, planChangeResult: { type: 'new_session' }, karmaCharged: 1 });

    expect(trophyRepo.events).toEqual([]);
  });
});

describe('runAiPlanJob analytics', () => {
  const params = { selectedOption: makeBody().selectedOption, preferences: 'p', duration: 1, budget: '', startDate: '', cityIds: [] };
  let aiPlanRequests: StubAiPlanRequestRepository;
  let ai: AiController;
  const run = (requestId: string, karmaCharged: number) => runAiPlanJob(
    { ai, aiPlanRequests, karma: new StubKarmaRepository(), notifications: new StubNotificationRepository() },
    { requestId, userId: 'u1', flowId: 'f', body: makeBody(), planChangeResult: { type: 'new_session' }, karmaCharged },
  );

  beforeEach(async () => {
    (capture as jest.Mock).mockClear();
    aiPlanRequests = new StubAiPlanRequestRepository();
    ai = new AiController();
  });

  it('forwards cta_ai_plan to PostHog on success', async () => {
    jest.spyOn(ai, 'generatePlan').mockResolvedValue({ title: 'T', stops: [], transits: [] });
    await aiPlanRequests.insert({ requestId: 'a1', userId: 'u1', planSessionId: 's', karmaCharged: 1, requestParams: params });
    await run('a1', 1);
    expect(capture).toHaveBeenCalledWith('u1', 'cta_ai_plan', { changeType: 'new_session', requestId: 'a1' });
    expect(capture).not.toHaveBeenCalledWith(expect.anything(), 'cta_ai_plan_failed', expect.anything());
  });

  it('captures cta_ai_plan_failed with refunded=true when karma was charged', async () => {
    jest.spyOn(ai, 'generatePlan').mockRejectedValue(new Error('boom'));
    await aiPlanRequests.insert({ requestId: 'a2', userId: 'u1', planSessionId: 's', karmaCharged: 1, requestParams: params });
    await run('a2', 1);
    expect(capture).toHaveBeenCalledWith('u1', 'cta_ai_plan_failed', { requestId: 'a2', refunded: true });
    expect(capture).not.toHaveBeenCalledWith(expect.anything(), 'cta_ai_plan', expect.anything());
  });

  it('captures cta_ai_plan_failed with refunded=false on a free change', async () => {
    jest.spyOn(ai, 'generatePlan').mockRejectedValue(new Error('boom'));
    await aiPlanRequests.insert({ requestId: 'a3', userId: 'u1', planSessionId: 's', karmaCharged: 0, requestParams: params });
    await run('a3', 0);
    expect(capture).toHaveBeenCalledWith('u1', 'cta_ai_plan_failed', { requestId: 'a3', refunded: false });
  });
});

describe('runAiPlanJob — first run (F79)', () => {
  let aiPlanRequests: StubAiPlanRequestRepository;
  let karma: StubKarmaRepository;
  let notifications: StubNotificationRepository;
  let users: StubUserRepository;
  let trips: StubTripRepository;
  let ai: AiController;
  let userId: string;

  const stop = (cityId: string) => ({ cityId, checkIn: '01/07/2026', checkOut: '03/07/2026', selectedAttractions: [] });
  const body = makeBody({
    selectedOption: { id: 0, title: 'Viaje a Paris', summary: 'Itinerario de 3 días por Paris', highlights: ['Paris'], cityIds: ['paris'] },
    planSessionId: undefined, budget: undefined,
  });

  async function run() {
    await aiPlanRequests.insert({ requestId: 'req-fp', userId, planSessionId: '', karmaCharged: 0,
      requestParams: { selectedOption: body.selectedOption, preferences: '', cityIds: ['paris'], firstRun: true } });
    await runAiPlanJob(
      { ai, aiPlanRequests, karma, notifications, users, trips, trophies: { record: jest.fn() } as unknown as TrophyRecorder },
      { requestId: 'req-fp', userId, flowId: 'f', body, planChangeResult: { type: 'new_session' }, karmaCharged: 0, firstPlan: { cityIds: ['paris'] } },
    );
  }

  beforeEach(async () => {
    (capture as jest.Mock).mockClear();
    aiPlanRequests = new StubAiPlanRequestRepository();
    karma = new StubKarmaRepository();
    notifications = new StubNotificationRepository();
    users = new StubUserRepository();
    trips = new StubTripRepository();
    ai = new AiController();
    userId = (await users.create({ name: 'A', email: 'a@x.com', passwordHash: 'h' })).id;
    await users.claimFirstPlan(userId);
  });

  it('creates the trip and marks the row with its id; notification points at the trip', async () => {
    jest.spyOn(ai, 'generatePlan').mockResolvedValue({ title: 'Paris 3 días', stops: [stop('paris')], transits: [] });
    await run();
    const saved = await trips.findByOwner(userId);
    expect(saved).toHaveLength(1);
    const row = await aiPlanRequests.findById('req-fp');
    expect(row).toMatchObject({ status: 'completed', tripId: saved[0].id });
    const [n] = await notifications.listByUser(userId);
    expect(n).toMatchObject({ type: 'ai_plan_ready', url: `/my-trips?tab=trips&focus=${saved[0].id}` });
    expect(n.body).toBe('Tu primer plan "Paris 3 días" ya está guardado en Mis viajes.');
    expect(capture).toHaveBeenCalledWith(userId, 'cta_first_plan_saved', { path: 'ai', requestId: 'req-fp', tripId: saved[0].id });
    expect(capture).not.toHaveBeenCalledWith(userId, 'cta_ai_plan', expect.anything());
  });

  it('records the source request on the trip', async () => {
    jest.spyOn(ai, 'generatePlan').mockResolvedValue({ title: 'P', stops: [stop('paris')], transits: [] });
    const create = jest.spyOn(trips, 'create');
    await run();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ ownerId: userId, sourceAiPlanRequestId: 'req-fp', title: 'P' }));
  });

  it('drops stops outside cities', async () => {
    jest.spyOn(ai, 'generatePlan').mockResolvedValue({
      title: 'P', stops: [stop('paris'), stop('tokyo')],
      transits: [{ fromCityId: 'paris', toCityId: 'tokyo', segments: [] }],
    });
    await run();
    const [trip] = await trips.findByOwner(userId);
    expect(trip.stops.map(s => s.cityId)).toEqual(['paris']);
    expect(trip.transits).toEqual([]);
  });

  it('returns the gift when no stop survives', async () => {
    jest.spyOn(ai, 'generatePlan').mockResolvedValue({ title: 'P', stops: [stop('tokyo')], transits: [] });
    await run();
    expect((await aiPlanRequests.findById('req-fp'))!.status).toBe('failed');
    expect((await users.findById(userId))!.firstPlanUsedAt).toBeNull();
    expect(await trips.findByOwner(userId)).toEqual([]);
    expect(karma.awarded).toEqual([]);
    const [n] = await notifications.listByUser(userId);
    expect(n.type).toBe('ai_plan_failed');
    expect(n.body).toContain('Puedes intentarlo de nuevo');
  });

  it('returns the gift when the model call fails', async () => {
    jest.spyOn(ai, 'generatePlan').mockRejectedValue(new Error('DeepSeek down'));
    await run();
    expect((await users.findById(userId))!.firstPlanUsedAt).toBeNull();
  });

  it('keeps a saved first plan completed when the ready notification fails', async () => {
    jest.spyOn(ai, 'generatePlan').mockResolvedValue({ title: 'P', stops: [stop('paris')], transits: [] });
    jest.spyOn(notifications, 'add').mockRejectedValueOnce(new Error('notify down'));
    await run();
    const [trip] = await trips.findByOwner(userId);
    expect(await aiPlanRequests.findById('req-fp')).toMatchObject({ status: 'completed', tripId: trip.id });
    expect((await notifications.listByUser(userId)).some(n => n.type === 'ai_plan_failed')).toBe(false);
    expect((await users.findById(userId))!.firstPlanUsedAt).not.toBeNull();
  });

  it('never marks a saved first plan failed when markCompleted throws after the save', async () => {
    jest.spyOn(ai, 'generatePlan').mockResolvedValue({ title: 'P', stops: [stop('paris')], transits: [] });
    jest.spyOn(aiPlanRequests, 'markCompleted').mockRejectedValueOnce(new Error('db blip'));
    const markFailed = jest.spyOn(aiPlanRequests, 'markFailed');
    await run();
    expect(markFailed).not.toHaveBeenCalled();
    expect((await notifications.listByUser(userId)).some(n => n.type === 'ai_plan_failed')).toBe(false);
    expect((await users.findById(userId))!.firstPlanUsedAt).not.toBeNull();
  });

  it('does not record the ai_plans trophy', async () => {
    jest.spyOn(ai, 'generatePlan').mockResolvedValue({ title: 'P', stops: [stop('paris')], transits: [] });
    const trophies = { record: jest.fn() } as unknown as TrophyRecorder;
    await aiPlanRequests.insert({ requestId: 'req-fp', userId, planSessionId: '', karmaCharged: 0,
      requestParams: { selectedOption: body.selectedOption, preferences: '' } });
    await runAiPlanJob(
      { ai, aiPlanRequests, karma, notifications, users, trips, trophies },
      { requestId: 'req-fp', userId, flowId: 'f', body, planChangeResult: { type: 'new_session' }, karmaCharged: 0, firstPlan: { cityIds: ['paris'] } },
    );
    expect(trophies.record).not.toHaveBeenCalled();
  });
});
