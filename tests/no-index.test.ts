import request from 'supertest';
import express from 'express';
import { noIndexApi, robotsTxt } from '../src/middleware/no-index.middleware';

function buildApp() {
  const app = express();
  app.use(noIndexApi);
  app.get('/robots.txt', robotsTxt);
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return app;
}

describe('API noindex', () => {
  it('adds X-Robots-Tag to every response', async () => {
    const res = await request(buildApp()).get('/health');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('serves an allow-all robots.txt as text/plain (crawling is allowed; X-Robots-Tag blocks indexing)', async () => {
    const res = await request(buildApp()).get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toBe('User-agent: *\nAllow: /\n');
  });
});
