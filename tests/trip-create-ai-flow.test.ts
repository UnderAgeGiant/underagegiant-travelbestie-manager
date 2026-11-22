import request from 'supertest';
import express from 'express';
import {
  StubUserRepository, StubTripRepository, StubKarmaRepository, StubNotificationRepository,
  StubCollaboratorRepository, StubHighlightRepository, StubAiPlanRequestRepository,
} from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { TripController } from '../src/controllers/trip.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { CollaboratorController } from '../src/controllers/collaborator.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createTripsRouter } from '../src/routes/trips.routes';
import { errorHandler } from '../src/middleware/error.middleware';
import { capture } from '../src/lib/analytics';

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
jest.mock('../src/lib/analytics', () => ({
  ...jest.requireActual('../src/lib/analytics'),
  capture: jest.fn(),
}));

const OPTION = { id: 0, title: 'Viaje a Rome', summary: 's', highlights: ['Rome'] };

let aiPlans: StubAiPlanRequestRepository;
let app: express.Express;
let token: string;
let userId: string;

beforeEach(async () => {
  (capture as jest.Mock).mockClear();
  const users = new StubUserRepository();
  const trips = new StubTripRepository();
  const collaborators = new StubCollaboratorRepository(users, trips);
  aiPlans = new StubAiPlanRequestRepository();
  app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(users), new StubHighlightRepository()));
  app.use('/trips', createTripsRouter(
    new TripController(trips), new KarmaController(new StubKarmaRepository(100)), new CollaboratorController(collaborators),
    collaborators, users, trips, new StubNotificationRepository(), undefined, undefined, aiPlans,
  ));
  app.use(errorHandler);
  const res = await request(app).post('/auth/register')
    .send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
  token = res.body.token;
  userId = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).userId;
});

const createTrip = (sourceAiPlanRequestId?: string) => request(app).post('/trips')
  .set('Authorization', `Bearer ${token}`)
  .send({ title: 'Roma', stops: [], transits: [], ...(sourceAiPlanRequestId ? { sourceAiPlanRequestId } : {}) });

const tripCreateProps = () =>
  (capture as jest.Mock).mock.calls.filter(c => c[1] === 'cta_trip_create').map(c => c[2])[0];

async function seed(requestId: string, owner: string, flow?: 'simple' | 'advanced') {
  await aiPlans.insert({ requestId, userId: owner, planSessionId: 's', karmaCharged: 9,
    requestParams: { selectedOption: OPTION, preferences: '', ...(flow ? { flow } : {}) } });
}

describe('POST /trips — cta_trip_create flow (F84)', () => {
  it('simple row → flow simple', async () => {
    await seed('req-simple', userId, 'simple');
    expect((await createTrip('req-simple')).status).toBe(201);
    expect(tripCreateProps()).toMatchObject({ fromAi: true, flow: 'simple' });
  });

  it('row without flow → flow advanced', async () => {
    await seed('req-old', userId);
    await createTrip('req-old');
    expect(tripCreateProps()).toMatchObject({ flow: 'advanced' });
  });

  it("another user's row → no flow", async () => {
    await seed('req-other', 'someone-else', 'simple');
    await createTrip('req-other');
    expect(tripCreateProps()).not.toHaveProperty('flow');
  });

  it('findById throws → 201 and no flow', async () => {
    jest.spyOn(aiPlans, 'findById').mockRejectedValue(new Error('db down'));
    expect((await createTrip('req-x')).status).toBe(201);
    expect(tripCreateProps()).not.toHaveProperty('flow');
  });

  it('no sourceAiPlanRequestId → no lookup, no flow', async () => {
    const find = jest.spyOn(aiPlans, 'findById');
    await createTrip();
    expect(find).not.toHaveBeenCalled();
    expect(tripCreateProps()).not.toHaveProperty('flow');
  });
});
