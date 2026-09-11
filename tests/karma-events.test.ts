import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubKarmaRepository, StubKarmaPurchaseRepository, StubNotificationRepository, StubHighlightRepository } from './helpers/stubs';
import { UserController }  from '../src/controllers/user.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { KarmaPurchaseController } from '../src/controllers/karma-purchase.controller';
import { MercadoPagoController } from '../src/controllers/mercadopago.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createKarmaRouter } from '../src/routes/karma.routes';
import { errorHandler }     from '../src/middleware/error.middleware';

jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({
  decryptPayloadMiddleware: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../src/middleware/auth/verify-otp.middleware', () => ({
  verifyOtpMiddleware: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../src/middleware/rate-limit.middleware', () => ({
  rateLimitMiddleware: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../src/lib/refresh-tokens', () => ({
  REFRESH_TTL: 86400,
  issueRefreshToken: jest.fn().mockResolvedValue('mock-refresh-token'),
  validateAndRotate: jest.fn(),
  revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));

const mockPoolQuery = jest.fn();
const mockPool = { query: mockPoolQuery } as any;

// Three distinct query shapes hit the same mock pool in one request:
//   1. trip existence,       "SELECT trip_id FROM trips WHERE trip_id = ANY(...)"
//   2. ai_plan -> trip link, "SELECT trip_id, source_ai_plan_request_id FROM trips WHERE source_ai_plan_request_id = ANY(...)"
//   3. ai_plan_requests existence, "SELECT request_id FROM ai_plan_requests WHERE request_id = ANY(...)"
// Distinguished by substring since both (1) and (2) start "FROM trips".
function setPoolResults(
  tripIds: string[],
  savedAiPlanLinks: { sourceRequestId: string; tripId: string }[],
  aiPlanRequestIds: string[],
) {
  mockPoolQuery.mockImplementation((sql: string) => {
    if (sql.includes('source_ai_plan_request_id = ANY')) {
      return Promise.resolve({
        rows: savedAiPlanLinks.map(l => ({ trip_id: l.tripId, source_ai_plan_request_id: l.sourceRequestId })),
      });
    }
    if (sql.includes('FROM trips')) return Promise.resolve({ rows: tripIds.map(trip_id => ({ trip_id })) });
    if (sql.includes('FROM ai_plan_requests')) return Promise.resolve({ rows: aiPlanRequestIds.map(request_id => ({ request_id })) });
    return Promise.resolve({ rows: [] });
  });
}

function buildApp() {
  const karmaRepo = new StubKarmaRepository(100);
  const purchaseRepo = new StubKarmaPurchaseRepository();
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(new StubUserRepository()), new StubHighlightRepository()));
  app.use('/karma', createKarmaRouter(
    new KarmaController(karmaRepo),
    new KarmaPurchaseController(purchaseRepo),
    new MercadoPagoController(purchaseRepo),
    purchaseRepo,
    new StubUserRepository(),
    new StubNotificationRepository(),
    karmaRepo,
    mockPool,
  ));
  app.use(errorHandler);
  return { app, karmaRepo };
}

async function getToken(app: express.Express): Promise<string> {
  const res = await request(app)
    .post('/auth/register')
    .send({ name: 'Tester', email: 'karma-events@test.com', password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

describe('GET /karma/events', () => {
  beforeEach(() => { mockPoolQuery.mockReset(); setPoolResults([], [], []); });

  it('401s without auth', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/karma/events');
    expect(res.status).toBe(401);
  });

  it('never returns another user\'s events, even when both have events on the same page window', async () => {
    const { app, karmaRepo } = buildApp();

    const tokenA = await getToken(app); // registers 'karma-events@test.com'
    const resB = await request(app)
      .post('/auth/register')
      .send({ name: 'Other', email: 'karma-events-other@test.com', password: 'secret123', otp: '123456' });
    const tokenB = resB.body.token as string;

    const { userId: userIdA } = JSON.parse(Buffer.from(tokenA.split('.')[1], 'base64').toString());
    const { userId: userIdB } = JSON.parse(Buffer.from(tokenB.split('.')[1], 'base64').toString());

    await karmaRepo.spendAmount(userIdA, 1, 'trip_created', 'trip-a');
    await karmaRepo.spendAmount(userIdB, 1, 'trip_created', 'trip-b');

    const resAsA = await request(app).get('/karma/events').set('Authorization', `Bearer ${tokenA}`);
    expect(resAsA.body.events).toHaveLength(1);
    expect(resAsA.body.events[0].reason).toBe('trip_created');

    const resAsB = await request(app).get('/karma/events').set('Authorization', `Bearer ${tokenB}`);
    expect(resAsB.body.events).toHaveLength(1);
    expect(resAsA.body.events[0].eventId).not.toBe(resAsB.body.events[0].eventId);
  });

  it('returns the ledger newest-first', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);
    const { userId } = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

    await karmaRepo.spendAmount(userId, 1, 'trip_created', 'trip-1');
    await karmaRepo.award(userId, 3, 'karma_purchased', 'purchase-1');

    const res = await request(app).get('/karma/events').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(2);
    expect(res.body.events[0].reason).toBe('karma_purchased');
    expect(res.body.events[0].delta).toBe(3);
    expect(res.body.events[1].reason).toBe('trip_created');
    expect(res.body.events[1].delta).toBe(-1);
  });

  it('attaches a trip target only when the trip still exists', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);
    const { userId } = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

    const tripLiveId = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
    await karmaRepo.spendAmount(userId, 1, 'trip_created', tripLiveId);
    await karmaRepo.spendAmount(userId, 1, 'itinerary_exported', 'trip-deleted');
    setPoolResults([tripLiveId], [], []);

    const res = await request(app).get('/karma/events').set('Authorization', `Bearer ${token}`);
    const live = res.body.events.find((e: any) => e.reason === 'trip_created');
    const deleted = res.body.events.find((e: any) => e.reason === 'itinerary_exported');
    expect(live.target).toEqual({ type: 'trip', id: tripLiveId });
    expect(deleted.target).toBeNull();
  });

  it('attaches an ai_plan_request target when the row still exists and is not yet saved', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);
    const { userId } = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

    const reqLiveId = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
    await karmaRepo.spendAmount(userId, 1, 'ai_plan', reqLiveId);
    await karmaRepo.spendAmount(userId, 1, 'ai_plan', 'req-discarded');
    setPoolResults([], [], [reqLiveId]);

    const res = await request(app).get('/karma/events').set('Authorization', `Bearer ${token}`);
    const events = res.body.events.filter((e: any) => e.reason === 'ai_plan');
    const liveEvent = events.find((e: any) => e.target !== null);
    const discardedEvent = events.find((e: any) => e.target === null);
    expect(liveEvent.target).toEqual({ type: 'ai_plan_request', id: reqLiveId });
    expect(discardedEvent).toBeDefined();
  });

  it('attaches a trip target (not ai_plan_request) when the ai_plan has since been saved', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);
    const { userId } = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

    const reqSavedId = 'cccccccc-3333-4333-8333-cccccccccccc';
    await karmaRepo.spendAmount(userId, 1, 'ai_plan', reqSavedId);
    // The ai_plan_requests row is gone (hard-deleted on save) — only the trip's
    // source_ai_plan_request_id link resolves it now.
    setPoolResults([], [{ sourceRequestId: reqSavedId, tripId: 'trip-from-plan' }], []);

    const res = await request(app).get('/karma/events').set('Authorization', `Bearer ${token}`);
    expect(res.body.events[0].target).toEqual({ type: 'trip', id: 'trip-from-plan' });
  });

  it('never attaches a target to a non-linkable reason', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);
    const { userId } = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

    await karmaRepo.spendAmount(userId, 9, 'ai_suggest', 'flow-1');
    setPoolResults(['flow-1'], [{ sourceRequestId: 'flow-1', tripId: 'trip-x' }], ['flow-1']); // even if these existed, ai_suggest must never link

    const res = await request(app).get('/karma/events').set('Authorization', `Bearer ${token}`);
    expect(res.body.events[0].target).toBeNull();
  });

  it('never resolves an ai_plan_refund event via the trip-source link, even when both queries match its ref_id', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);
    const { userId } = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

    const reqRefundedId = 'dddddddd-4444-4444-8444-dddddddddddd';
    await karmaRepo.award(userId, 1, 'ai_plan_refund', reqRefundedId);
    // Both the trip-source-link query and the ai_plan_requests-existence query
    // would resolve this id — proves the code ignores the trip-source link for
    // ai_plan_refund (only 'ai_plan' can ever have produced a saved trip) and
    // uses the plain existence check instead.
    setPoolResults([], [{ sourceRequestId: reqRefundedId, tripId: 'trip-should-not-be-used' }], [reqRefundedId]);

    const res = await request(app).get('/karma/events').set('Authorization', `Bearer ${token}`);
    expect(res.body.events[0].target).toEqual({ type: 'ai_plan_request', id: reqRefundedId });
  });

  it('paginates and returns nextCursor when there are more rows', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);
    const { userId } = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

    for (let i = 0; i < 3; i++) await karmaRepo.spendAmount(userId, 1, 'trip_created', `trip-${i}`);

    const res = await request(app).get('/karma/events?limit=2').set('Authorization', `Bearer ${token}`);
    expect(res.body.events).toHaveLength(2);
    expect(res.body.nextCursor).toBeTruthy();

    const res2 = await request(app)
      .get(`/karma/events?limit=2&cursor=${encodeURIComponent(res.body.nextCursor)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res2.body.events).toHaveLength(1);
    expect(res2.body.nextCursor).toBeNull();
  });

  it('400s on a malformed cursor', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const res = await request(app)
      .get('/karma/events?cursor=not-valid-base64-json')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('clamps limit above 50 down to 50, and defaults to 20 when invalid', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);
    const { userId } = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    for (let i = 0; i < 60; i++) await karmaRepo.spendAmount(userId, 1, 'trip_created', `trip-${i}`);

    const res = await request(app).get('/karma/events?limit=999').set('Authorization', `Bearer ${token}`);
    expect(res.body.events).toHaveLength(50);

    const res2 = await request(app).get('/karma/events?limit=abc').set('Authorization', `Bearer ${token}`);
    expect(res2.body.events).toHaveLength(20);
  });
});
