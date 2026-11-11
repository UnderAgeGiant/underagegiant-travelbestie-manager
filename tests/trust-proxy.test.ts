const incrKeys: string[] = [];
jest.mock('../src/lib/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
    incr: jest.fn((key: string) => { incrKeys.push(key); return Promise.resolve(1); }),
    expire: jest.fn(),
  },
}));
jest.mock('../src/lib/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/lib/deepseek', () => ({ deepseekClient: {} }));

import request from 'supertest';
import { app } from '../src/app';

describe('trust proxy (N-1): IP rate limits are per visitor', () => {
  beforeEach(() => { incrKeys.length = 0; });

  it('keys an IP rate limit by the address the proxy forwards', async () => {
    await request(app).get('/fx/rates').set('X-Forwarded-For', '203.0.113.7');
    expect(incrKeys).toContain('rl:fx:203.0.113.7');
  });

  it('ignores a client-forged first hop', async () => {
    await request(app).get('/fx/rates').set('X-Forwarded-For', '1.2.3.4, 203.0.113.7');
    expect(incrKeys).toContain('rl:fx:203.0.113.7');
    expect(incrKeys).not.toContain('rl:fx:1.2.3.4');
  });

  it('falls back to the socket address when nothing is forwarded', async () => {
    await request(app).get('/fx/rates');
    expect(incrKeys.some(k => /^rl:fx:(::1|::ffff:127\.0\.0\.1|127\.0\.0\.1)$/.test(k))).toBe(true);
  });
});
