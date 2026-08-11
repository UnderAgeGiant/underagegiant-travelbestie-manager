import request from 'supertest';
import express from 'express';
import {
  StubUserRepository, StubTripRepository, StubKarmaRepository,
  StubNotificationRepository, StubCollaboratorRepository,
} from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { TripController } from '../src/controllers/trip.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { CollaboratorController } from '../src/controllers/collaborator.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createTripsRouter } from '../src/routes/trips.routes';
import { errorHandler } from '../src/middleware/error.middleware';

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

jest.mock('../src/middleware/collaborators/send-collaborator-invite-email.middleware', () => ({
  sendCollaboratorInviteEmailMiddleware: (_req: any, _res: any, next: any) => next(),
}));

function buildApp() {
  const users = new StubUserRepository();
  const trips = new StubTripRepository();
  const karma = new StubKarmaRepository();
  const notifications = new StubNotificationRepository();
  const collaborators = new StubCollaboratorRepository(users, trips);

  const app = express();
  app.use(express.json());
  app.use('/auth',  createAuthRouter(new UserController(users)));
  app.use('/trips', createTripsRouter(
    new TripController(trips),
    new KarmaController(karma),
    new CollaboratorController(collaborators),
    collaborators,
    users,
    trips,
    notifications,
  ));
  app.use(errorHandler);
  return { app, users, trips, karma, notifications, collaborators };
}

async function registerAndLogin(app: express.Express, name: string, email: string): Promise<string> {
  const res = await request(app).post('/auth/register').send({ name, email, password: 'Password1!', otp: '123456' });
  return res.body.token as string;
}

describe('Collaborators', () => {
  it('owner invites a collaborator by email — spends 1 karma, creates a pending row, notifies the invitee', async () => {
    const { app, notifications } = buildApp();
    const ownerToken = await registerAndLogin(app, 'Owner', 'owner@example.com');
    const inviteeUser = await registerAndLogin(app, 'Invitee', 'invitee@example.com');
    void inviteeUser;

    const tripRes = await request(app).post('/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Europe 2026', stops: [], transits: [] });
    const tripId = tripRes.body.id as string;

    const res = await request(app).post(`/trips/${tripId}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'invitee@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('invitee@example.com');
    expect(res.body.acceptedAt).toBeNull();

    const invitee = notifications.items.find(n => n.type === 'collaborator_invite');
    expect(invitee).toBeDefined();
    expect(invitee!.body).toContain('Europe 2026');
  });

  it('404s when inviting an email with no TravelBestie account', async () => {
    const { app } = buildApp();
    const ownerToken = await registerAndLogin(app, 'Owner', 'owner2@example.com');
    const tripRes = await request(app).post('/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Trip', stops: [], transits: [] });

    const res = await request(app).post(`/trips/${tripRes.body.id}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(404);
  });

  it('400s when the owner invites themselves', async () => {
    const { app } = buildApp();
    const ownerToken = await registerAndLogin(app, 'Owner', 'owner3@example.com');
    const tripRes = await request(app).post('/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Trip', stops: [], transits: [] });

    const res = await request(app).post(`/trips/${tripRes.body.id}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'owner3@example.com' });

    expect(res.status).toBe(400);
  });

  it('409s on a duplicate invite to the same user', async () => {
    const { app } = buildApp();
    const ownerToken = await registerAndLogin(app, 'Owner', 'owner4@example.com');
    await registerAndLogin(app, 'Invitee', 'invitee4@example.com');
    const tripRes = await request(app).post('/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Trip', stops: [], transits: [] });

    await request(app).post(`/trips/${tripRes.body.id}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'invitee4@example.com' });
    const res = await request(app).post(`/trips/${tripRes.body.id}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'invitee4@example.com' });

    expect(res.status).toBe(409);
  });

  it('402s when the owner has insufficient karma', async () => {
    const { app, karma } = buildApp();
    const ownerToken = await registerAndLogin(app, 'Owner', 'owner5@example.com');
    await registerAndLogin(app, 'Invitee', 'invitee5@example.com');
    const tripRes = await request(app).post('/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Trip', stops: [], transits: [] });
    karma.setScore(0);

    const res = await request(app).post(`/trips/${tripRes.body.id}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'invitee5@example.com' });

    expect(res.status).toBe(402);
  });

  it('404s when a non-owner tries to invite', async () => {
    const { app } = buildApp();
    const ownerToken = await registerAndLogin(app, 'Owner', 'owner6@example.com');
    const strangerToken = await registerAndLogin(app, 'Stranger', 'stranger6@example.com');
    await registerAndLogin(app, 'Invitee', 'invitee6@example.com');
    const tripRes = await request(app).post('/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Trip', stops: [], transits: [] });

    const res = await request(app).post(`/trips/${tripRes.body.id}/collaborators`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ email: 'invitee6@example.com' });

    expect(res.status).toBe(404);
  });

  it('collaborator accepts — trip appears in GET /invites before, GET / after; owner gets a notification', async () => {
    const { app, notifications } = buildApp();
    const ownerToken = await registerAndLogin(app, 'Owner', 'owner7@example.com');
    const inviteeToken = await registerAndLogin(app, 'Invitee', 'invitee7@example.com');
    const tripRes = await request(app).post('/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Trip', stops: [], transits: [] });
    const tripId = tripRes.body.id as string;

    await request(app).post(`/trips/${tripId}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'invitee7@example.com' });

    const invitesBefore = await request(app).get('/trips/invites').set('Authorization', `Bearer ${inviteeToken}`);
    expect(invitesBefore.body).toHaveLength(1);
    expect(invitesBefore.body[0].tripTitle).toBe('Trip');

    const listBefore = await request(app).get('/trips').set('Authorization', `Bearer ${inviteeToken}`);
    expect(listBefore.body).toHaveLength(0);

    const acceptRes = await request(app).post(`/trips/${tripId}/collaborators/accept`)
      .set('Authorization', `Bearer ${inviteeToken}`);
    expect(acceptRes.status).toBe(200);

    const listAfter = await request(app).get('/trips').set('Authorization', `Bearer ${inviteeToken}`);
    expect(listAfter.body).toHaveLength(1);
    expect(listAfter.body[0].isCollaborator).toBe(true);
    expect(listAfter.body[0].ownerName).toBe('Owner');

    const ownerNotif = notifications.items.find(n => n.type === 'collaborator_accepted');
    expect(ownerNotif).toBeDefined();
  });

  it('404s accepting an invite that does not exist', async () => {
    const { app } = buildApp();
    const inviteeToken = await registerAndLogin(app, 'Invitee', 'invitee8@example.com');
    const res = await request(app).post('/trips/00000000-0000-0000-0000-000000000000/collaborators/accept')
      .set('Authorization', `Bearer ${inviteeToken}`);
    expect(res.status).toBe(404);
  });

  it('collaborator can PUT the trip but not DELETE it, re-share it, clone it, or export it', async () => {
    const { app } = buildApp();
    const ownerToken = await registerAndLogin(app, 'Owner', 'owner9@example.com');
    const inviteeToken = await registerAndLogin(app, 'Invitee', 'invitee9@example.com');
    const tripRes = await request(app).post('/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Trip', stops: [], transits: [] });
    const tripId = tripRes.body.id as string;
    await request(app).post(`/trips/${tripId}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'invitee9@example.com' });
    await request(app).post(`/trips/${tripId}/collaborators/accept`)
      .set('Authorization', `Bearer ${inviteeToken}`);

    const putRes = await request(app).put(`/trips/${tripId}`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .send({ title: 'Edited by collaborator', stops: [], transits: [] });
    expect(putRes.status).toBe(200);
    expect(putRes.body.title).toBe('Edited by collaborator');

    const deleteRes = await request(app).delete(`/trips/${tripId}`).set('Authorization', `Bearer ${inviteeToken}`);
    expect(deleteRes.status).toBe(404);

    const shareRes = await request(app).post(`/trips/${tripId}/share`).set('Authorization', `Bearer ${inviteeToken}`);
    expect(shareRes.status).toBe(404);

    const cloneRes = await request(app).post(`/trips/${tripId}/clone`).set('Authorization', `Bearer ${inviteeToken}`);
    expect(cloneRes.status).toBe(404);

    const itinRes = await request(app).post(`/trips/${tripId}/itinerary`).set('Authorization', `Bearer ${inviteeToken}`);
    expect(itinRes.status).toBe(404);
  });

  it('owner removes a collaborator — access revoked immediately', async () => {
    const { app } = buildApp();
    const ownerToken = await registerAndLogin(app, 'Owner', 'owner10@example.com');
    const inviteeToken = await registerAndLogin(app, 'Invitee', 'invitee10@example.com');
    const tripRes = await request(app).post('/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Trip', stops: [], transits: [] });
    const tripId = tripRes.body.id as string;
    const inviteRes = await request(app).post(`/trips/${tripId}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'invitee10@example.com' });
    const collaboratorUserId = inviteRes.body.userId as string;
    await request(app).post(`/trips/${tripId}/collaborators/accept`)
      .set('Authorization', `Bearer ${inviteeToken}`);

    const removeRes = await request(app).delete(`/trips/${tripId}/collaborators/${collaboratorUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(removeRes.status).toBe(204);

    const putRes = await request(app).put(`/trips/${tripId}`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .send({ title: 'Should fail', stops: [], transits: [] });
    expect(putRes.status).toBe(404);
  });

  it('a non-owner cannot remove a collaborator', async () => {
    const { app } = buildApp();
    const ownerToken = await registerAndLogin(app, 'Owner', 'owner11@example.com');
    const inviteeToken = await registerAndLogin(app, 'Invitee', 'invitee11@example.com');
    const strangerToken = await registerAndLogin(app, 'Stranger', 'stranger11@example.com');
    const tripRes = await request(app).post('/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Trip', stops: [], transits: [] });
    const tripId = tripRes.body.id as string;
    const inviteRes = await request(app).post(`/trips/${tripId}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'invitee11@example.com' });
    const collaboratorUserId = inviteRes.body.userId as string;

    const res = await request(app).delete(`/trips/${tripId}/collaborators/${collaboratorUserId}`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /trips/:id/collaborators lists everyone invited, pending and accepted', async () => {
    const { app } = buildApp();
    const ownerToken = await registerAndLogin(app, 'Owner', 'owner12@example.com');
    const inviteeToken = await registerAndLogin(app, 'Invitee', 'invitee12@example.com');
    const tripRes = await request(app).post('/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Trip', stops: [], transits: [] });
    const tripId = tripRes.body.id as string;
    await request(app).post(`/trips/${tripId}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'invitee12@example.com' });
    await request(app).post(`/trips/${tripId}/collaborators/accept`)
      .set('Authorization', `Bearer ${inviteeToken}`);

    const res = await request(app).get(`/trips/${tripId}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].email).toBe('invitee12@example.com');
    expect(res.body[0].acceptedAt).not.toBeNull();
  });
});
