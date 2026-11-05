jest.mock('@vercel/functions', () => ({ waitUntil: jest.fn() }));
jest.mock('../src/lib/analytics', () => ({ capture: jest.fn() }));

import express from 'express';
import request from 'supertest';
import { capture } from '../src/lib/analytics';
import { logger } from '../src/lib/logger';
import { requestLoggerMiddleware } from '../src/middleware/request-logger.middleware';
import { errorHandler, notFound } from '../src/middleware/error.middleware';

const app = express();
app.use(requestLoggerMiddleware);
app.get('/throw', (_req, _res, next) => next(new Error('db down')));
app.get('/caught', (req, res) => {
  logger.error({ msg: 'Failed to send', flowId: req.flowId });
  res.status(500).json({});
});
app.get('/silent', (_req, res) => { res.status(503).json({}); });
app.use(notFound);
app.use(errorHandler);

const serverErrors = () => (capture as jest.Mock).mock.calls.filter(c => c[1] === 'server_error');
// 'finish' fires after supertest resolves the response; let it run.
const settle = () => new Promise(r => setImmediate(r));

beforeEach(() => {
  (capture as jest.Mock).mockClear();
  jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
});
afterEach(() => jest.restoreAllMocks());

describe('request logger → server_error', () => {
  it('thrown 500 → exactly one server_error, carrying the real message and status', async () => {
    await request(app).get('/throw').expect(500);
    await settle();
    const calls = serverErrors();
    expect(calls).toHaveLength(1);
    expect(calls[0][2]).toMatchObject({ msg: 'db down', status: 500 });
  });

  it('caught-and-500 (generate-otp style) → exactly one', async () => {
    await request(app).get('/caught').expect(500);
    await settle();
    expect(serverErrors()).toHaveLength(1);
  });

  it('silent 5xx with no prior log → one alert from the request logger', async () => {
    await request(app).get('/silent').expect(503);
    await settle();
    const calls = serverErrors();
    expect(calls).toHaveLength(1);
    expect(calls[0][2]).toMatchObject({ status: 503, path: '/silent', method: 'GET' });
  });

  it('4xx never alerts', async () => {
    await request(app).get('/nope').expect(404);
    await settle();
    expect(serverErrors()).toHaveLength(0);
  });
});
