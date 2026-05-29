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

jest.mock('../src/lib/email', () => ({
  sendOtpEmail:              jest.fn().mockResolvedValue(undefined),
  sendWelcomeEmail:          jest.fn().mockResolvedValue(undefined),
  sendKarmaConfirmationEmail: jest.fn().mockResolvedValue(undefined),
}));

// Grab references after mocks are defined
const { redis: mockRedis } = jest.requireMock('../src/lib/redis') as { redis: Record<string, jest.Mock> };
const { sendOtpEmail: mockSendOtpEmail } = jest.requireMock('../src/lib/email') as { sendOtpEmail: jest.Mock };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(new StubUserRepository())));
  app.use(errorHandler);
  return app;
}

describe('POST /auth/request-otp', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 and stores OTP when email is available', async () => {
    const res = await request(buildApp())
      .post('/auth/request-otp')
      .send({ email: 'nuevo@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
    expect(mockRedis.set).toHaveBeenCalledWith(
      'otp:reg:nuevo@test.com',
      expect.stringContaining('"code"'),
      'EX',
      300,
    );
    expect(mockSendOtpEmail).toHaveBeenCalledWith(
      'nuevo@test.com',
      expect.stringMatching(/^\d{6}$/),
    );
  });

  it('normalises email to lowercase before storing OTP', async () => {
    await request(buildApp())
      .post('/auth/request-otp')
      .send({ email: 'UPPER@Test.COM' });

    expect(mockRedis.set).toHaveBeenCalledWith(
      'otp:reg:upper@test.com',
      expect.any(String),
      'EX',
      300,
    );
  });

  it('returns 400 when email is already registered', async () => {
    const app = buildApp();
    // Pre-register a user via /register (OTP mocked to pass)
    mockRedis.get.mockResolvedValue(JSON.stringify({ code: '123456' }));
    await request(app).post('/auth/register')
      .send({ name: 'Ana', email: 'ana@test.com', password: 'secret123', otp: '123456' });
    mockRedis.get.mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/request-otp')
      .send({ email: 'ana@test.com' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(buildApp()).post('/auth/request-otp').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/register (with OTP)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('registers successfully with valid OTP and returns token', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ code: '654321' }));

    const res = await request(buildApp())
      .post('/auth/register')
      .send({ name: 'María', email: 'maria@test.com', password: 'pass1234', otp: '654321' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.name).toBe('María');
    expect(res.body.user.passwordHash).toBeUndefined();
    // OTP must be consumed after successful verification
    expect(mockRedis.del).toHaveBeenCalledWith('otp:reg:maria@test.com');
  });

  it('returns 400 when OTP key does not exist in Redis (expired or never requested)', async () => {
    mockRedis.get.mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/auth/register')
      .send({ name: 'X', email: 'x@test.com', password: 'pass1234', otp: '000000' });

    expect(res.status).toBe(400);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('returns 400 on wrong OTP and auto-renews: stores new code and sends new email', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ code: '111111' }));

    const res = await request(buildApp())
      .post('/auth/register')
      .send({ name: 'X', email: 'x@test.com', password: 'pass1234', otp: '999999' });

    expect(res.status).toBe(400);
    // New OTP stored
    expect(mockRedis.set).toHaveBeenCalledWith(
      'otp:reg:x@test.com',
      expect.stringContaining('"code"'),
      'EX',
      300,
    );
    // New OTP emailed
    expect(mockSendOtpEmail).toHaveBeenCalledWith(
      'x@test.com',
      expect.stringMatching(/^\d{6}$/),
    );
  });

  it('returns 400 when otp field is missing', async () => {
    const res = await request(buildApp())
      .post('/auth/register')
      .send({ name: 'X', email: 'x@test.com', password: 'pass1234' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when email is already taken', async () => {
    const app = buildApp();
    mockRedis.get.mockResolvedValue(JSON.stringify({ code: '123456' }));
    await request(app).post('/auth/register')
      .send({ name: 'A', email: 'dupe@test.com', password: 'pass1234', otp: '123456' });

    const res = await request(app).post('/auth/register')
      .send({ name: 'B', email: 'dupe@test.com', password: 'pass5678', otp: '123456' });

    expect(res.status).toBe(400);
  });
});
