import express, { Request, Response } from 'express';
import request from 'supertest';

const mockRedis = {
  incr:   jest.fn(),
  expire: jest.fn().mockResolvedValue(1),
};
jest.mock('../src/lib/redis', () => ({ redis: mockRedis }));

import { rateLimitMiddleware } from '../src/middleware/rate-limit.middleware';

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

  it('sets TTL only on first request (count === 1)', async () => {
    mockRedis.incr.mockResolvedValue(1);
    await request(buildLimitedApp(5)).get('/ping');
    expect(mockRedis.expire).toHaveBeenCalledWith(expect.any(String), 60);
  });

  it('does not set TTL on subsequent requests', async () => {
    mockRedis.incr.mockResolvedValue(2);
    await request(buildLimitedApp(5)).get('/ping');
    expect(mockRedis.expire).not.toHaveBeenCalled();
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
