jest.mock('../src/lib/redis', () => ({ redis: { get: jest.fn(), set: jest.fn(), incr: jest.fn(), expire: jest.fn() } }));
jest.mock('../src/lib/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/lib/deepseek', () => ({ deepseekClient: {} }));

import request from 'supertest';
import { app } from '../src/app';

describe('API security headers (B-8)', () => {
  it('sets X-Content-Type-Options: nosniff on responses', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('does not leak the Express X-Powered-By header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
