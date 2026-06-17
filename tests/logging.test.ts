import { Request, Response, NextFunction } from 'express';
import express from 'express';
import request from 'supertest';

jest.mock('../src/lib/redis', () => ({ redis: { incr: jest.fn(), expire: jest.fn() } }));

function mockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    flowId: 'test-flow-id',
    method: 'GET',
    originalUrl: '/test',
    headers: {},
    user: undefined,
    ...overrides,
  } as unknown as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe('logEvent', () => {
  let writeSpy: jest.SpyInstance;
  beforeEach(() => { writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true); });
  afterEach(() => { writeSpy.mockRestore(); });

  it('emits a JSON line with event, flowId, userId, and extra meta', () => {
    const { logEvent } = require('../src/lib/log-event');
    const { req } = mockReqRes({ user: { userId: 'u-1' } as any });
    logEvent(req, 'cta_test', { foo: 1 });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const line = JSON.parse((writeSpy.mock.calls[0][0] as string).trim());
    expect(line.event).toBe('cta_test');
    expect(line.flowId).toBe('test-flow-id');
    expect(line.userId).toBe('u-1');
    expect(line.foo).toBe(1);
  });

  it('sets userId to null when req.user is absent', () => {
    const { logEvent } = require('../src/lib/log-event');
    const { req } = mockReqRes();
    logEvent(req, 'cta_test');

    const line = JSON.parse((writeSpy.mock.calls[0][0] as string).trim());
    expect(line.userId).toBeNull();
  });
});

describe('logCtaEvent', () => {
  it('calls next() once and does not throw', () => {
    const { logCtaEvent } = require('../src/lib/log-event');
    const { req, res, next } = mockReqRes();
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    logCtaEvent('cta_test')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });
});

describe('respondError', () => {
  let writeSpy: jest.SpyInstance;
  beforeEach(() => { writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true); });
  afterEach(() => { writeSpy.mockRestore(); });

  it('calls res.status(404) and res.json with the body, and emits a WARN log line with status 404', () => {
    const { respondError } = require('../src/lib/respond-error');
    const { req, res } = mockReqRes();
    respondError(req, res, 404, { error: 'X' });

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'X' });

    const warnLine = (writeSpy.mock.calls as string[][])
      .map(args => JSON.parse(args[0].trim()))
      .find(l => l.level === 'WARN');
    expect(warnLine).toBeDefined();
    expect(warnLine.status).toBe(404);
  });
});

describe('requestLoggerMiddleware', () => {
  it('sets X-Flow-Id response header to a valid UUID', async () => {
    const { requestLoggerMiddleware } = require('../src/middleware/request-logger.middleware');
    const app = express();
    app.use(requestLoggerMiddleware);
    app.get('/ping', (_req, res) => res.json({ ok: true }));

    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const res = await request(app).get('/ping');
    jest.restoreAllMocks();

    const flowId = res.headers['x-flow-id'];
    expect(flowId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('includes userId in the exit log line for an authenticated request', async () => {
    const { requestLoggerMiddleware } = require('../src/middleware/request-logger.middleware');
    const app = express();
    app.use(requestLoggerMiddleware);
    app.get('/ping', (req, res) => {
      (req as any).user = { userId: 'u-42' };
      res.json({ ok: true });
    });

    const lines: any[] = [];
    jest.spyOn(process.stdout, 'write').mockImplementation((data) => {
      lines.push(JSON.parse((data as string).trim()));
      return true;
    });
    await request(app).get('/ping');
    jest.restoreAllMocks();

    const exitLine = lines.find(l => l.msg === '← response');
    expect(exitLine).toBeDefined();
    expect(exitLine.userId).toBe('u-42');
  });
});

describe('errorHandler', () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy  = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    errorSpy = warnSpy; // same spy — we differentiate by level in the JSON
  });
  afterEach(() => { warnSpy.mockRestore(); });

  function parsedLines() {
    return (warnSpy.mock.calls as string[][]).map(args => JSON.parse(args[0].trim()));
  }

  it('calls logger.warn (not logger.error) for a 404 error', () => {
    const { errorHandler } = require('../src/middleware/error.middleware');
    const { req, res, next } = mockReqRes();
    const err = Object.assign(new Error('Trip not found'), { status: 404 });
    errorHandler(err, req, res, next);

    const lines = parsedLines();
    expect(lines.some(l => l.level === 'WARN')).toBe(true);
    expect(lines.some(l => l.level === 'ERROR')).toBe(false);
  });

  it('calls logger.error with stack for a 500 error', () => {
    const { errorHandler } = require('../src/middleware/error.middleware');
    const { req, res, next } = mockReqRes();
    const err = new Error('Something exploded');
    errorHandler(err, req, res, next);

    const lines = parsedLines();
    const errorLine = lines.find(l => l.level === 'ERROR');
    expect(errorLine).toBeDefined();
    expect(errorLine.stack).toBeDefined();
  });
});
