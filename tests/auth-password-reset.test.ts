import request from 'supertest';
import express from 'express';
import { StubUserRepository } from './helpers/stubs';
import { UserController } from '../src/controllers/user.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { errorHandler } from '../src/middleware/error.middleware';

jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({
  decryptPayloadMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/middleware/rate-limit.middleware', () => ({
  rateLimitMiddleware: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/lib/redis', () => ({
  redis: {
    set:    jest.fn().mockResolvedValue('OK'),
    get:    jest.fn().mockResolvedValue(null),
    del:    jest.fn().mockResolvedValue(1),
    incr:   jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
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

const { redis: mockRedis } = jest.requireMock('../src/lib/redis') as { redis: Record<string, jest.Mock> };
const { sendOtpEmail: mockSendOtpEmail } = jest.requireMock('../src/lib/email') as { sendOtpEmail: jest.Mock };
const { invalidateUserSessions: mockInvalidate } = jest.requireMock('../src/lib/refresh-tokens') as { invalidateUserSessions: jest.Mock };

function buildApp(repo = new StubUserRepository()) {
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(repo)));
  app.use(errorHandler);
  return app;
}

// Register a user so we have a known account to reset.
async function seedUser(app: express.Express, email = 'reset@test.com'): Promise<void> {
  mockRedis.get.mockResolvedValue(JSON.stringify({ code: '123456' }));
  await request(app).post('/auth/register')
    .send({ name: 'Reset', email, password: 'oldpass123', otp: '123456' });
  mockRedis.get.mockResolvedValue(null);
}

describe('POST /auth/request-password-reset', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 and emails an OTP when the email exists', async () => {
    const app = buildApp();
    await seedUser(app);

    const res = await request(app)
      .post('/auth/request-password-reset')
      .send({ email: 'reset@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
    expect(mockRedis.set).toHaveBeenCalledWith(
      'otp:reset:reset@test.com',
      expect.stringContaining('"code"'),
      'EX',
      300,
    );
    expect(mockSendOtpEmail).toHaveBeenCalledWith('reset@test.com', expect.stringMatching(/^\d{6}$/));
  });

  it('returns 200 WITHOUT emailing when the email is unknown (no enumeration)', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/auth/request-password-reset')
      .send({ email: 'ghost@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(buildApp()).post('/auth/request-password-reset').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/reset-password', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resets the password with a valid OTP and invalidates sessions', async () => {
    const app = buildApp();
    await seedUser(app);
    mockRedis.get.mockResolvedValue(JSON.stringify({ code: '654321' }));

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'reset@test.com', otp: '654321', newPassword: 'brandnew123' });

    expect(res.status).toBe(200);
    expect(mockRedis.del).toHaveBeenCalledWith('otp:reset:reset@test.com');
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
  });

  it('lets the user log in with the new password afterwards', async () => {
    const app = buildApp();
    await seedUser(app);
    mockRedis.get.mockResolvedValue(JSON.stringify({ code: '654321' }));
    await request(app).post('/auth/reset-password')
      .send({ email: 'reset@test.com', otp: '654321', newPassword: 'brandnew123' });

    const login = await request(app).post('/auth/login')
      .send({ email: 'reset@test.com', password: 'brandnew123' });

    expect(login.status).toBe(200);
    expect(login.body.token).toBeDefined();
  });

  it('returns 400 on wrong OTP and auto-renews (stores + emails a new code)', async () => {
    const app = buildApp();
    await seedUser(app);
    mockRedis.get.mockResolvedValue(JSON.stringify({ code: '111111' }));

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'reset@test.com', otp: '999999', newPassword: 'brandnew123' });

    expect(res.status).toBe(400);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'otp:reset:reset@test.com',
      expect.stringContaining('"code"'),
      'EX',
      300,
    );
    expect(mockSendOtpEmail).toHaveBeenCalledWith('reset@test.com', expect.stringMatching(/^\d{6}$/));
  });

  it('returns 400 when the OTP key is missing (expired / never requested)', async () => {
    const app = buildApp();
    await seedUser(app);
    mockRedis.get.mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'reset@test.com', otp: '654321', newPassword: 'brandnew123' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when newPassword is too short', async () => {
    const res = await request(buildApp())
      .post('/auth/reset-password')
      .send({ email: 'reset@test.com', otp: '654321', newPassword: '123' });
    expect(res.status).toBe(400);
  });
});
