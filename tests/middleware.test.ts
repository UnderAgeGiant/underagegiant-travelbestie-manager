import { Request, Response, NextFunction } from 'express';
import { hashPassword } from '../src/lib/password';
import { signToken } from '../src/lib/jwt';

function mockReqRes(body: object = {}, params: object = {}, headers: object = {}) {
  const req = { body: { ...body }, params: { ...params }, headers: { ...headers }, user: undefined, foundUser: undefined, trip: undefined, result: undefined } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe('validate middleware', () => {
  const { validate } = require('../src/middleware/validate.middleware');

  it('calls next when all required fields present', () => {
    const { req, res, next } = mockReqRes({ name: 'Ana', email: 'a@b.com', password: 'secret' });
    validate({ name: { required: true }, email: { required: true }, password: { required: true, minLength: 6 } })(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('returns 400 when required field missing', () => {
    const { req, res, next } = mockReqRes({ email: 'a@b.com' });
    validate({ name: { required: true }, email: { required: true } })(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalledWith();
  });

  it('returns 400 when field too short', () => {
    const { req, res, next } = mockReqRes({ name: 'A', email: 'a@b.com', password: '12' });
    validate({ password: { required: true, minLength: 6 } })(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('require-auth middleware', () => {
  const { requireAuth } = require('../src/middleware/auth/require-auth.middleware');

  it('returns 401 when no Authorization header', () => {
    const { req, res, next } = mockReqRes();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('sets req.user and calls next for valid token', () => {
    const token = signToken({ userId: 'u1', email: 'a@b.com', name: 'Ana' });
    const { req, res, next } = mockReqRes({}, {}, { authorization: `Bearer ${token}` });
    requireAuth(req, res, next);
    expect((req as any).user?.userId).toBe('u1');
    expect(next).toHaveBeenCalledWith();
  });
});

describe('hash-password middleware', () => {
  const { hashPasswordMiddleware } = require('../src/middleware/auth/hash-password.middleware');

  it('replaces req.body.password with a bcrypt hash', async () => {
    const { req, res, next } = mockReqRes({ password: 'secret123' });
    await hashPasswordMiddleware(req, res, next);
    expect((req.body as any).passwordHash).toBeDefined();
    expect((req.body as any).passwordHash).not.toBe('secret123');
    expect(next).toHaveBeenCalledWith();
  });
});

describe('verify-password middleware', () => {
  const { verifyPasswordMiddleware } = require('../src/middleware/auth/verify-password.middleware');

  it('calls next when password matches', async () => {
    const hash = await hashPassword('secret123');
    const { req, res, next } = mockReqRes({ password: 'secret123' });
    (req as any).foundUser = { passwordHash: hash };
    await verifyPasswordMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('returns 401 when password does not match', async () => {
    const hash = await hashPassword('secret123');
    const { req, res, next } = mockReqRes({ password: 'wrong' });
    (req as any).foundUser = { passwordHash: hash };
    await verifyPasswordMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when foundUser is undefined', async () => {
    const { req, res, next } = mockReqRes({ password: 'x' });
    await verifyPasswordMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('check-trip-ownership middleware', () => {
  const { checkTripOwnership } = require('../src/middleware/trips/check-trip-ownership.middleware');

  it('calls next when trip.ownerId matches req.user.userId', () => {
    const { req, res, next } = mockReqRes();
    (req as any).user = { userId: 'u1' };
    (req as any).trip = { ownerId: 'u1' };
    checkTripOwnership(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('returns 404 when trip is undefined', () => {
    const { req, res, next } = mockReqRes();
    (req as any).user = { userId: 'u1' };
    checkTripOwnership(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 when ownerId does not match', () => {
    const { req, res, next } = mockReqRes();
    (req as any).user = { userId: 'u1' };
    (req as any).trip = { ownerId: 'u2' };
    checkTripOwnership(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('validate-rating middleware', () => {
  const { validateRating } = require('../src/middleware/comments/validate-rating.middleware');

  it('calls next for rating 1–5', () => {
    const { req, res, next } = mockReqRes({ rating: 4 });
    validateRating(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('returns 400 for rating 6', () => {
    const { req, res, next } = mockReqRes({ rating: 6 });
    validateRating(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for rating 0', () => {
    const { req, res, next } = mockReqRes({ rating: 0 });
    validateRating(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('inject-comment-author middleware', () => {
  const { injectCommentAuthor } = require('../src/middleware/comments/inject-comment-author.middleware');

  it('sets req.body.name from req.user.name', () => {
    const { req, res, next } = mockReqRes({});
    (req as any).user = { name: 'Ana', email: 'ana@test.com', userId: 'u1' };
    injectCommentAuthor(req, res, next);
    expect((req.body as any).name).toBe('Ana');
    expect(next).toHaveBeenCalledWith();
  });
});
