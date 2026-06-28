import request from 'supertest';
import express from 'express';
import * as bcrypt from 'bcryptjs';
import { StubUserRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { errorHandler } from '../src/middleware/error.middleware';
import { User } from '../src/types';

// ── Mocks ──────────────────────────────────────────────────────────────────
jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({
  decryptPayloadMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/middleware/rate-limit.middleware', () => ({
  rateLimitMiddleware: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/lib/redis', () => ({
  redis: {
    set:  jest.fn().mockResolvedValue('OK'),
    get:  jest.fn().mockResolvedValue(null),
    del:  jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('../src/lib/refresh-tokens', () => ({
  REFRESH_TTL:            86400,
  issueRefreshToken:      jest.fn().mockResolvedValue('mock-refresh-token'),
  validateAndRotate:      jest.fn(),
  revokeRefreshToken:     jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/lib/email', () => ({
  sendOtpEmail:               jest.fn().mockResolvedValue(undefined),
  sendWelcomeEmail:           jest.fn().mockResolvedValue(undefined),
  sendKarmaConfirmationEmail: jest.fn().mockResolvedValue(undefined),
}));

const mockRedis      = (jest.requireMock('../src/lib/redis') as { redis: Record<string, jest.Mock> }).redis;
const mockSendOtpEmail = (jest.requireMock('../src/lib/email') as { sendOtpEmail: jest.Mock }).sendOtpEmail;

// ── Fixed test data ────────────────────────────────────────────────────────
const TEST_USER_ID       = 'profile-test-user-id';
const TEST_PASSWORD_HASH = bcrypt.hashSync('OldPass123', 10);

const testUser: User = {
  id:           TEST_USER_ID,
  name:         'Test User',
  email:        'test@example.com',
  passwordHash: TEST_PASSWORD_HASH,
  homeCity:     null,
  createdAt:    new Date().toISOString(),
};

jest.mock('../src/middleware/auth/require-auth.middleware', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: TEST_USER_ID, email: 'test@example.com', name: 'Test User' };
    next();
  },
}));

// ── App builder ────────────────────────────────────────────────────────────
function buildApp() {
  const stub = new StubUserRepository([testUser]);
  const app  = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(stub)));
  app.use(errorHandler);
  return app;
}

// ── POST /auth/request-profile-otp ────────────────────────────────────────
describe('POST /auth/request-profile-otp', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 and emails OTP when new email is available', async () => {
    const res = await request(buildApp())
      .post('/auth/request-profile-otp')
      .send({ newEmail: 'new@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
    expect(mockRedis.set).toHaveBeenCalledWith(
      'otp:profile:new@example.com',
      expect.stringContaining('"code"'),
      'EX',
      300,
    );
    expect(mockSendOtpEmail).toHaveBeenCalledWith(
      'new@example.com',
      expect.stringMatching(/^\d{6}$/),
    );
  });

  it('normalises new email to lowercase', async () => {
    await request(buildApp())
      .post('/auth/request-profile-otp')
      .send({ newEmail: 'NEW@Example.COM' });

    expect(mockRedis.set).toHaveBeenCalledWith(
      'otp:profile:new@example.com',
      expect.any(String),
      'EX',
      300,
    );
  });

  it('returns 400 when newEmail is missing', async () => {
    const res = await request(buildApp()).post('/auth/request-profile-otp').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when newEmail is the same as current email', async () => {
    const res = await request(buildApp())
      .post('/auth/request-profile-otp')
      .send({ newEmail: 'test@example.com' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when newEmail is already registered by another user', async () => {
    const stub = new StubUserRepository([testUser]);
    await stub.create({ name: 'Other', email: 'taken@example.com', passwordHash: 'x' });
    const app = express();
    app.use(express.json());
    app.use('/auth', createAuthRouter(new UserController(stub)));
    app.use(errorHandler);

    const res = await request(app)
      .post('/auth/request-profile-otp')
      .send({ newEmail: 'taken@example.com' });
    expect(res.status).toBe(400);
  });
});

// ── PUT /auth/profile — name update ───────────────────────────────────────
describe('PUT /auth/profile — name', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 and updated user when name is valid', async () => {
    const res = await request(buildApp())
      .put('/auth/profile')
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('New Name');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('returns 400 when name is an empty string', async () => {
    const res = await request(buildApp())
      .put('/auth/profile')
      .send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when no updateable fields are provided', async () => {
    const res = await request(buildApp()).put('/auth/profile').send({});
    expect(res.status).toBe(400);
  });
});

// ── PUT /auth/profile — email update ──────────────────────────────────────
describe('PUT /auth/profile — email change', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 and updates email when OTP is valid', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ code: '654321' }));

    const res = await request(buildApp())
      .put('/auth/profile')
      .send({ newEmail: 'updated@example.com', otp: '654321' });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('updated@example.com');
    expect(mockRedis.del).toHaveBeenCalledWith('otp:profile:updated@example.com');
  });

  it('returns 400 when otp field is missing on email change', async () => {
    const res = await request(buildApp())
      .put('/auth/profile')
      .send({ newEmail: 'updated@example.com' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when OTP is expired (Redis returns null)', async () => {
    mockRedis.get.mockResolvedValue(null);

    const res = await request(buildApp())
      .put('/auth/profile')
      .send({ newEmail: 'updated@example.com', otp: '000000' });
    expect(res.status).toBe(400);
  });

  it('returns 400 on wrong OTP and auto-renews (stores new code, sends new email)', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ code: '111111' }));

    const res = await request(buildApp())
      .put('/auth/profile')
      .send({ newEmail: 'updated@example.com', otp: '999999' });

    expect(res.status).toBe(400);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'otp:profile:updated@example.com',
      expect.stringContaining('"code"'),
      'EX',
      300,
    );
    expect(mockSendOtpEmail).toHaveBeenCalledWith(
      'updated@example.com',
      expect.stringMatching(/^\d{6}$/),
    );
  });

  it('returns 400 when new email is same as current', async () => {
    const res = await request(buildApp())
      .put('/auth/profile')
      .send({ newEmail: 'test@example.com', otp: '123456' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when new email is already taken', async () => {
    const stub = new StubUserRepository([testUser]);
    await stub.create({ name: 'Other', email: 'taken@example.com', passwordHash: 'x' });
    const app = express();
    app.use(express.json());
    app.use('/auth', createAuthRouter(new UserController(stub)));
    app.use(errorHandler);

    const res = await request(app)
      .put('/auth/profile')
      .send({ newEmail: 'taken@example.com', otp: '123456' });
    expect(res.status).toBe(400);
  });
});

// ── PUT /auth/profile — password change ───────────────────────────────────
describe('PUT /auth/profile — password change', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 when currentPassword is correct and newPassword is valid', async () => {
    const res = await request(buildApp())
      .put('/auth/profile')
      .send({ currentPassword: 'OldPass123', newPassword: 'NewPass456' });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('returns 400 when currentPassword is wrong', async () => {
    const res = await request(buildApp())
      .put('/auth/profile')
      .send({ currentPassword: 'WrongPass', newPassword: 'NewPass456' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/incorrecta/i);
  });

  it('returns 400 when currentPassword is missing but newPassword is provided', async () => {
    const res = await request(buildApp())
      .put('/auth/profile')
      .send({ newPassword: 'NewPass456' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when newPassword is shorter than 6 characters', async () => {
    const res = await request(buildApp())
      .put('/auth/profile')
      .send({ currentPassword: 'OldPass123', newPassword: 'abc' });

    expect(res.status).toBe(400);
  });

  it('ignores user-supplied newPasswordHash in the body — cannot bypass current-password check', async () => {
    const res = await request(buildApp())
      .put('/auth/profile')
      .send({ newPasswordHash: '$2b$10$attacker_controlled_hash_value_here' });

    expect(res.status).toBe(400);
  });
});
