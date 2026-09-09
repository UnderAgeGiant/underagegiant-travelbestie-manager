jest.mock('../src/lib/redis', () => ({ redis: { get: jest.fn(), set: jest.fn(), incr: jest.fn(), expire: jest.fn() } }));
jest.mock('../src/lib/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/lib/deepseek', () => ({ deepseekClient: {} }));

import request from 'supertest';
import { app } from '../src/app';

describe('CORS preflight caching', () => {
  it('sets Access-Control-Max-Age so the browser caches the preflight instead of re-issuing OPTIONS on every request', async () => {
    const res = await request(app)
      .options('/health')
      .set('Origin', 'http://localhost:4200')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'X-Anonymous-Id');

    expect(res.headers['access-control-max-age']).toBe('86400');
  });
});
