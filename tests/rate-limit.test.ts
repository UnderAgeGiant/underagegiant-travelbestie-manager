import express, { Request, Response } from 'express';
import request from 'supertest';

const mockRedis = {
  incr:   jest.fn(),
  expire: jest.fn().mockResolvedValue(1),
};
jest.mock('../src/lib/redis', () => ({ redis: mockRedis }));

import { rateLimitMiddleware, rateLimitMultiplier } from '../src/middleware/rate-limit.middleware';

function buildLimitedApp(maxRequests: number) {
  const app = express();
  app.use(rateLimitMiddleware({ keyPrefix: 'test:rl', windowSeconds: 60, maxRequests }));
  app.get('/ping', (_req: Request, res: Response) => res.json({ ok: true }));
  return app;
}

describe('rateLimitMiddleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('allows requests under the limit', async () => {
    mockRedis.incr.mockResolvedValue(1);
    const res = await request(buildLimitedApp(3)).get('/ping');
    expect(res.status).toBe(200);
  });

  it('allows exactly max requests', async () => {
    mockRedis.incr.mockResolvedValue(3);
    const res = await request(buildLimitedApp(3)).get('/ping');
    expect(res.status).toBe(200);
  });

  it('returns 429 when count exceeds maxRequests', async () => {
    mockRedis.incr.mockResolvedValue(4); // exceeds max=3
    const res = await request(buildLimitedApp(3)).get('/ping');
    expect(res.status).toBe(429);
    expect(res.body.error).toBeDefined();
  });

  it('sets TTL on the first request using NX so it never clobbers an existing one', async () => {
    mockRedis.incr.mockResolvedValue(1);
    await request(buildLimitedApp(5)).get('/ping');
    expect(mockRedis.expire).toHaveBeenCalledWith(expect.any(String), 60, 'NX');
  });

  it('re-applies the NX TTL on subsequent requests too, so a key left without a TTL by a prior transient Redis failure self-heals on its very next hit', async () => {
    mockRedis.incr.mockResolvedValue(2);
    await request(buildLimitedApp(5)).get('/ping');
    expect(mockRedis.expire).toHaveBeenCalledWith(expect.any(String), 60, 'NX');
  });

  it('sets Retry-After to the window on 429', async () => {
    mockRedis.incr.mockResolvedValue(4);
    const res = await request(buildLimitedApp(3)).get('/ping');
    expect(res.headers['retry-after']).toBe('60');
  });

  it('fails open when Redis throws — request is allowed', async () => {
    mockRedis.incr.mockRejectedValue(new Error('Redis down'));
    const res = await request(buildLimitedApp(3)).get('/ping');
    expect(res.status).toBe(200);
  });

  it('uses custom getKey if provided', async () => {
    mockRedis.incr.mockResolvedValue(1);
    const app = express();
    app.use(rateLimitMiddleware({
      keyPrefix: 'custom',
      windowSeconds: 60,
      maxRequests: 5,
      getKey: (req) => req.headers['x-user-id'] as string ?? 'anon',
    }));
    app.get('/ping', (_req, res) => res.json({ ok: true }));
    await request(app).get('/ping').set('x-user-id', 'user-42');
    expect(mockRedis.incr).toHaveBeenCalledWith('custom:user-42');
  });
});

describe('rateLimitMultiplier', () => {
  it('defaults to 1', () => expect(rateLimitMultiplier({})).toBe(1));
  it('applies a valid multiplier in dev', () =>
    expect(rateLimitMultiplier({ NODE_ENV: 'development', RATE_LIMIT_MULTIPLIER: '100' })).toBe(100));
  it.each(['abc', '0', '-5', '0.5', 'Infinity', ''])('ignores garbage %p', (v) =>
    expect(rateLimitMultiplier({ RATE_LIMIT_MULTIPLIER: v })).toBe(1));
  it('is forced to 1 in production', () =>
    expect(rateLimitMultiplier({ NODE_ENV: 'production', RATE_LIMIT_MULTIPLIER: '100' })).toBe(1));
  it('is forced to 1 on Vercel', () =>
    expect(rateLimitMultiplier({ VERCEL: '1', RATE_LIMIT_MULTIPLIER: '100' })).toBe(1));
});

describe('rateLimitMiddleware with multiplier', () => {
  afterEach(() => { delete process.env.RATE_LIMIT_MULTIPLIER; });
  it('allows count up to max × multiplier', async () => {
    process.env.RATE_LIMIT_MULTIPLIER = '10';
    mockRedis.incr.mockResolvedValue(30); // > 3 but ≤ 30
    const res = await request(buildLimitedApp(3)).get('/ping');
    expect(res.status).toBe(200);
  });
  it('still blocks above max × multiplier', async () => {
    process.env.RATE_LIMIT_MULTIPLIER = '10';
    mockRedis.incr.mockResolvedValue(31);
    const res = await request(buildLimitedApp(3)).get('/ping');
    expect(res.status).toBe(429);
  });
});
