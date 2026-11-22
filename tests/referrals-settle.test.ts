import request from 'supertest';
import express from 'express';
import {
  StubUserRepository, StubTripRepository, StubKarmaRepository, StubNotificationRepository, StubCollaboratorRepository,
  StubHighlightRepository, StubFavoriteRepository, StubReferralRepository, StubAiPlanRequestRepository,
} from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { TripController } from '../src/controllers/trip.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { CollaboratorController } from '../src/controllers/collaborator.controller';
import { AiController } from '../src/controllers/ai.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createTripsRouter } from '../src/routes/trips.routes';
import { createSharedRouter } from '../src/routes/shared.routes';
import { errorHandler } from '../src/middleware/error.middleware';
import { runAiPlanJob } from '../src/lib/ai-plan-job';
import { AiPlanBody } from '../src/schemas/ai.schemas';

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
  REFRESH_TTL:            86400,
  issueRefreshToken:      jest.fn().mockResolvedValue('mock-refresh-token'),
  validateAndRotate:      jest.fn(),
  revokeRefreshToken:     jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/lib/analytics', () => ({ capture: jest.fn(), alias: jest.fn() }));
jest.mock('../src/lib/deepseek', () => ({ deepseekClient: {} }));
jest.mock('../src/lib/redis', () => ({
  redis: { set: jest.fn().mockResolvedValue('OK'), get: jest.fn().mockResolvedValue(null) },
  planSessionKey: (u: string, s: string) => `plan:${u}:${s}`,
}));

let users: StubUserRepository;
let trips: StubTripRepository;
let referrals: StubReferralRepository;
let notifications: StubNotificationRepository;
let app: express.Express;
let referrerId: string;
let referrerToken: string;
let code: string;

const userIdOf = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).userId as string;

async function signUp(email: string): Promise<{ id: string; token: string }> {
  const res = await request(app).post('/auth/register').send({ name: 'Nuevo', email, password: 'secret123', otp: '123456' });
  return { id: userIdOf(res.body.token), token: res.body.token };
}

/** A new account referred by the referrer (attached directly; attribution has its own suite). */
async function referred(email: string, anon: string | null = null) {
  const u = await signUp(email);
  await referrals.attach(u.id, code, 'link', anon);
  return u;
}

const saveTrip = (token: string) => request(app).post('/trips').set('Authorization', `Bearer ${token}`)
  .send({ title: 'Roma', stops: [], transits: [] });

const referrerNotes = () => notifications.items.filter(n => n.userId === referrerId);

beforeEach(async () => {
  users = new StubUserRepository();
  trips = new StubTripRepository();
  referrals = new StubReferralRepository(users);
  notifications = new StubNotificationRepository();
  const collaborators = new StubCollaboratorRepository(users, trips);
  const tripCtrl = new TripController(trips);
  const karmaCtrl = new KarmaController(new StubKarmaRepository(100));
  app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(users), new StubHighlightRepository()));
  app.use('/trips', createTripsRouter(tripCtrl, karmaCtrl, new CollaboratorController(collaborators), collaborators, users, trips,
    notifications, undefined, undefined, undefined, referrals));
  app.use('/shared', createSharedRouter(tripCtrl, karmaCtrl, new StubFavoriteRepository(), notifications, undefined, users, referrals));
  app.use(errorHandler);
  ({ id: referrerId, token: referrerToken } = await signUp('ana@test.com'));
  code = await referrals.getOrCreateCode(referrerId);
});

describe('referral settlement on the first saved plan (F81)', () => {
  it('POST /trips with the gift pays the referrer 10 once, with the reward notification', async () => {
    const u = await referred('new@test.com');
    expect((await saveTrip(u.token)).status).toBe(201);
    expect(referrals.credits).toEqual([{ userId: referrerId, amount: 10, refId: u.id }]);
    expect(referrerNotes()).toEqual([expect.objectContaining({
      type: 'referral_reward', title: '+10 Tokens por tu invitación 🎉', body: 'Una persona que invitaste creó su primer plan.', url: '/preferences',
    })]);
    const settle = jest.spyOn(referrals, 'settle');
    await saveTrip(u.token);                       // paid save: gift already used
    expect(settle).not.toHaveBeenCalled();
    expect(referrals.credits).toHaveLength(1);
  });

  it('at 90 this month, two saves at once → one paid, one cap', async () => {
    for (let i = 0; i < 9; i++) {
      await referrals.attach(`old-${i}`, code, 'link', null);
      await referrals.settle(`old-${i}`);
    }
    referrals.capResetsOn = '2026-12-01';
    const [a, b] = [await referred('a@test.com'), await referred('b@test.com')];
    await Promise.all([saveTrip(a.token), saveTrip(b.token)]);
    expect(referrals.credits.reduce((s, c) => s + c.amount, 0)).toBe(100);
    expect([...referrals.rows.values()].filter(r => r.outcome === 'cap')).toHaveLength(1);
    const cap = referrerNotes().find(n => n.type === 'referral_cap')!;
    expect(cap.title).toBe('Llegaste al máximo del mes');
    expect(cap.body.endsWith('Vuelves a sumar el 1 de diciembre.')).toBe(true);
  });

  it('same_browser → no Tokens, same-browser notification', async () => {
    const anon = '11111111-1111-4111-8111-111111111111';
    await referrals.recordAnonymousId(referrerId, anon);
    const u = await referred('new@test.com', anon);
    await saveTrip(u.token);
    expect(referrals.credits).toEqual([]);
    expect(referrerNotes().map(n => n.type)).toEqual(['referral_same_browser']);
  });

  it('settle throwing → the save still returns 201', async () => {
    const u = await referred('new@test.com');
    jest.spyOn(referrals, 'settle').mockRejectedValue(new Error('db down'));
    expect((await saveTrip(u.token)).status).toBe(201);
  });

  it('POST /shared/:shareId/clone with the gift settles', async () => {
    const own = await saveTrip(referrerToken);
    const share = await request(app).post(`/trips/${own.body.id}/share`).set('Authorization', `Bearer ${referrerToken}`);
    const u = await referred('new@test.com');
    const clone = await request(app).post(`/shared/${share.body.shareId}/clone`).set('Authorization', `Bearer ${u.token}`);
    expect(clone.status).toBe(201);
    expect(referrals.credits).toEqual([{ userId: referrerId, amount: 10, refId: u.id }]);
  });
});

describe('referral settlement in the first-run AI job (F81)', () => {
  const body = {
    selectedOption: { id: 0, title: 'Viaje a Paris', summary: 's', highlights: ['Paris'], cityIds: ['paris'] },
    duration: 3, cityIds: ['paris'],
  } as unknown as AiPlanBody;

  async function runJob(referralsDep: StubReferralRepository) {
    const aiPlanRequests = new StubAiPlanRequestRepository();
    const ai = new AiController();
    jest.spyOn(ai, 'generatePlan').mockResolvedValue({
      title: 'P', stops: [{ cityId: 'paris', checkIn: '01/07/2026', checkOut: '03/07/2026', selectedAttractions: [] }] as never, transits: [],
    });
    const u = await referred('new@test.com');
    await users.claimFirstPlan(u.id);
    await aiPlanRequests.insert({ requestId: 'req-fp', userId: u.id, planSessionId: '', karmaCharged: 0,
      requestParams: { selectedOption: body.selectedOption, preferences: '', firstRun: true } });
    await runAiPlanJob(
      { ai, aiPlanRequests, karma: new StubKarmaRepository(), notifications, users, trips, referrals: referralsDep },
      { requestId: 'req-fp', userId: u.id, flowId: 'f', body, planChangeResult: { type: 'new_session' }, karmaCharged: 0, firstPlan: { cityIds: ['paris'] } },
    );
    return { u, row: await aiPlanRequests.findById('req-fp') };
  }

  it('pays the referrer after the trip is saved', async () => {
    const { u } = await runJob(referrals);
    expect(referrals.credits).toEqual([{ userId: referrerId, amount: 10, refId: u.id }]);
  });

  it('settle rejecting → job still completed with the trip, ai_plan_ready sent, gift kept', async () => {
    jest.spyOn(referrals, 'settle').mockRejectedValue(new Error('db down'));
    const { u, row } = await runJob(referrals);
    expect(row!.status).toBe('completed');
    expect(row!.tripId).toBeTruthy();
    expect(notifications.items.some(n => n.userId === u.id && n.type === 'ai_plan_ready')).toBe(true);
    expect((await users.findById(u.id))!.firstPlanUsedAt).not.toBeNull();
  });
});
