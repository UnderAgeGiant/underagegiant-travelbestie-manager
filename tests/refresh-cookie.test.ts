import express from 'express';
import request from 'supertest';
import {
  REFRESH_COOKIE,
  setRefreshCookie,
  clearRefreshCookie,
} from '../src/lib/refresh-cookie';

function appWith(handler: express.RequestHandler) {
  const app = express();
  app.get('/set', handler);
  return app;
}

describe('refresh-cookie helper', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = ORIGINAL_ENV; });

  it('sets an HttpOnly cookie scoped to /auth with the raw token', async () => {
    const app = appWith((_req, res) => { setRefreshCookie(res, 'raw-token-123'); res.end(); });
    const res = await request(app).get('/set');
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toContain(`${REFRESH_COOKIE}=raw-token-123`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/auth/i);
  });

  it('marks the cookie Secure + SameSite=Lax in production', async () => {
    process.env.NODE_ENV = 'production';
    const app = appWith((_req, res) => { setRefreshCookie(res, 'raw'); res.end(); });
    const cookie = (await request(app).get('/set')).headers['set-cookie'][0];
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('uses SameSite=Lax and no Secure outside production', async () => {
    process.env.NODE_ENV = 'test';
    const app = appWith((_req, res) => { setRefreshCookie(res, 'raw'); res.end(); });
    const cookie = (await request(app).get('/set')).headers['set-cookie'][0];
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Secure/i);
  });

  it('clearRefreshCookie expires the cookie', async () => {
    const app = appWith((_req, res) => { clearRefreshCookie(res); res.end(); });
    const cookie = (await request(app).get('/set')).headers['set-cookie'][0];
    expect(cookie).toContain(`${REFRESH_COOKIE}=`);
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  });
});
