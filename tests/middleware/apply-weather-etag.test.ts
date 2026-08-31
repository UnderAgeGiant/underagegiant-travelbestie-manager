import { applyWeatherEtag } from '../../src/middleware/weather/apply-weather-etag.middleware';

function buildReqRes(days: unknown, ifNoneMatch?: string) {
  const req = { result: { days }, headers: ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {} } as any;
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    set(name: string, value: string) { this.headers[name] = value; },
    end: jest.fn(),
  } as any;
  return { req, res };
}

describe('applyWeatherEtag', () => {
  const DAYS = [{ date: '30/08/2026', type: 'forecast', tempMaxC: 23, tempMinC: 14, weatherCode: 3 }];

  it('sets an ETag and Cache-Control:no-store, then calls next() when there is no If-None-Match', () => {
    const { req, res } = buildReqRes(DAYS);
    const next = jest.fn();
    applyWeatherEtag(req, res, next);

    expect(res.headers['ETag']).toBeTruthy();
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(next).toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });

  it('produces the same ETag for the same days payload', () => {
    const { req: req1, res: res1 } = buildReqRes(DAYS);
    applyWeatherEtag(req1, res1, jest.fn());
    const { req: req2, res: res2 } = buildReqRes(DAYS);
    applyWeatherEtag(req2, res2, jest.fn());
    expect(res1.headers['ETag']).toBe(res2.headers['ETag']);
  });

  it('produces a different ETag for a different days payload', () => {
    const { req: req1, res: res1 } = buildReqRes(DAYS);
    applyWeatherEtag(req1, res1, jest.fn());
    const otherDays = [{ ...DAYS[0], tempMaxC: 99 }];
    const { req: req2, res: res2 } = buildReqRes(otherDays);
    applyWeatherEtag(req2, res2, jest.fn());
    expect(res1.headers['ETag']).not.toBe(res2.headers['ETag']);
  });

  it('short-circuits with 304 and no body when If-None-Match matches', () => {
    const { req: req1, res: res1 } = buildReqRes(DAYS);
    applyWeatherEtag(req1, res1, jest.fn());
    const etag = res1.headers['ETag'];

    const { req: req2, res: res2 } = buildReqRes(DAYS, etag);
    const next = jest.fn();
    applyWeatherEtag(req2, res2, next);

    expect(res2.statusCode).toBe(304);
    expect(res2.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('does not short-circuit when If-None-Match does not match', () => {
    const { req, res } = buildReqRes(DAYS, '"stale-etag"');
    const next = jest.fn();
    applyWeatherEtag(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });
});
