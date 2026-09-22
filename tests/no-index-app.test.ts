jest.mock('../src/lib/redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), incr: jest.fn().mockResolvedValue(1), expire: jest.fn() },
}));
jest.mock('../src/lib/db', () => ({ pool: { query: jest.fn().mockResolvedValue({ rows: [] }) } }));
jest.mock('../src/lib/deepseek', () => ({ deepseekClient: {} }));

import request from 'supertest';
import { app } from '../src/app';

// Wiring check against the real app (the unit tests in no-index.test.ts use a local express app).
describe('real app: API host is never indexed', () => {
  it('sends X-Robots-Tag on a normal response', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('sends X-Robots-Tag on a 404 too', async () => {
    const res = await request(app).get('/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('serves an allow-all robots.txt (crawling allowed; X-Robots-Tag blocks indexing)', async () => {
    const res = await request(app).get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.text).toBe('User-agent: *\nAllow: /\n');
  });

  it('mounts /seo (unknown share id → 404 from the seo router, not the generic notFound)', async () => {
    const res = await request(app).get('/seo/shared/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Shared trip not found' });
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  });
});
