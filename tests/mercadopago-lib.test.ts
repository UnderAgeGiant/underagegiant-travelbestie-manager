import { createHmac } from 'crypto';

const ORIGINAL_ENV = process.env;

describe('verifyMpWebhookSignature', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, MERCADOPAGO_WEBHOOK_SECRET: 'test-secret' };
  });

  afterAll(() => { process.env = ORIGINAL_ENV; });

  function sign(dataId: string, requestId: string, ts: string, secret = 'test-secret'): string {
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const hash = createHmac('sha256', secret).update(manifest).digest('hex');
    return `ts=${ts},v1=${hash}`;
  }

  it('accepts a correctly-signed notification', () => {
    const { verifyMpWebhookSignature } = require('../src/lib/mercadopago');
    const xSignature = sign('123456', 'req-abc', '1700000000');
    expect(verifyMpWebhookSignature(xSignature, 'req-abc', '123456')).toBe(true);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const { verifyMpWebhookSignature } = require('../src/lib/mercadopago');
    const xSignature = sign('123456', 'req-abc', '1700000000', 'wrong-secret');
    expect(verifyMpWebhookSignature(xSignature, 'req-abc', '123456')).toBe(false);
  });

  it('rejects when the dataId does not match what was signed', () => {
    const { verifyMpWebhookSignature } = require('../src/lib/mercadopago');
    const xSignature = sign('123456', 'req-abc', '1700000000');
    expect(verifyMpWebhookSignature(xSignature, 'req-abc', '999999')).toBe(false);
  });

  it('rejects a missing signature header', () => {
    const { verifyMpWebhookSignature } = require('../src/lib/mercadopago');
    expect(verifyMpWebhookSignature(undefined, 'req-abc', '123456')).toBe(false);
  });

  it('rejects a malformed signature header (no v1 segment)', () => {
    const { verifyMpWebhookSignature } = require('../src/lib/mercadopago');
    expect(verifyMpWebhookSignature('ts=1700000000', 'req-abc', '123456')).toBe(false);
  });

  it('rejects when MERCADOPAGO_WEBHOOK_SECRET is not configured', () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = '';
    const { verifyMpWebhookSignature } = require('../src/lib/mercadopago');
    const xSignature = sign('123456', 'req-abc', '1700000000');
    expect(verifyMpWebhookSignature(xSignature, 'req-abc', '123456')).toBe(false);
  });
});

describe('createMpPreference', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      MERCADOPAGO_ACCESS_TOKEN: 'test-token',
      FRONTEND_ORIGIN: 'https://app.example.com',
    };
  });

  afterEach(() => { global.fetch = originalFetch; });
  afterAll(() => { process.env = ORIGINAL_ENV; });

  it('posts a preference with CLP items and back_urls built from purchaseRef', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'pref-123', init_point: 'https://mp.example.com/checkout/pref-123' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { createMpPreference } = require('../src/lib/mercadopago');
    const result = await createMpPreference('3600', 'karma_50', 'mp_abc-123');

    expect(result).toEqual({ preferenceId: 'pref-123', initPoint: 'https://mp.example.com/checkout/pref-123' });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/checkout/preferences');
    const body = JSON.parse(opts.body);
    expect(body.external_reference).toBe('mp_abc-123');
    expect(body.items[0]).toMatchObject({ quantity: 1, unit_price: 3600, currency_id: 'CLP' });
    expect(body.back_urls.success).toBe('https://app.example.com/?mp_purchase=mp_abc-123&mp_status=success');
    expect(body.back_urls.failure).toBe('https://app.example.com/?mp_purchase=mp_abc-123&mp_status=failure');
    expect(body.back_urls.pending).toBe('https://app.example.com/?mp_purchase=mp_abc-123&mp_status=pending');
    // auto_return is only valid when back_urls point at a real, public domain —
    // MercadoPago rejects it outright for localhost (see the 'omits auto_return...' test below).
    expect(body.auto_return).toBe('approved');
  });

  it('omits auto_return when FRONTEND_ORIGIN is localhost (MercadoPago rejects auto_return with a local back_urls domain — "auto_return invalid. back_url.success must be defined")', async () => {
    process.env.FRONTEND_ORIGIN = 'http://localhost:4200';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'pref-123', init_point: 'https://mp.example.com/checkout/pref-123' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { createMpPreference } = require('../src/lib/mercadopago');
    await createMpPreference('3600', 'karma_50', 'mp_abc-123');

    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    // back_urls still get built (harmless — the webhook, not the browser redirect,
    // is what actually completes the purchase) but auto_return must be absent.
    expect(body.back_urls.success).toBe('http://localhost:4200/?mp_purchase=mp_abc-123&mp_status=success');
    expect(body.auto_return).toBeUndefined();
  });

  it('omits auto_return when FRONTEND_ORIGIN is 127.0.0.1', async () => {
    process.env.FRONTEND_ORIGIN = 'http://127.0.0.1:4200';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'pref-123', init_point: 'https://mp.example.com/checkout/pref-123' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { createMpPreference } = require('../src/lib/mercadopago');
    await createMpPreference('3600', 'karma_50', 'mp_abc-123');

    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.auto_return).toBeUndefined();
  });

  it('throws when the MercadoPago API responds with an error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' }) as unknown as typeof fetch;
    const { createMpPreference } = require('../src/lib/mercadopago');
    await expect(createMpPreference('3600', 'karma_50', 'mp_abc')).rejects.toThrow('MercadoPago create preference error');
  });
});

describe('fetchMpPayment', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, MERCADOPAGO_ACCESS_TOKEN: 'test-token' };
  });

  afterEach(() => { global.fetch = originalFetch; });
  afterAll(() => { process.env = ORIGINAL_ENV; });

  it('fetches and maps a payment by id', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'approved', external_reference: 'mp_abc', transaction_amount: 3600 }),
    }) as unknown as typeof fetch;

    const { fetchMpPayment } = require('../src/lib/mercadopago');
    const result = await fetchMpPayment('pay-999');
    expect(result).toEqual({ status: 'approved', externalReference: 'mp_abc', transactionAmount: 3600 });
  });
});

describe('searchMpPayments', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, MERCADOPAGO_ACCESS_TOKEN: 'test-token' };
  });

  afterEach(() => { global.fetch = originalFetch; });
  afterAll(() => { process.env = ORIGINAL_ENV; });

  it('searches by external_reference, sorted most-recent-first, and maps results to {id, status}', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { id: 111, status: 'rejected' },
          { id: 222, status: 'in_process' },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { searchMpPayments } = require('../src/lib/mercadopago');
    const result = await searchMpPayments('mp_abc-123');

    expect(result).toEqual([
      { id: '111', status: 'rejected' },
      { id: '222', status: 'in_process' },
    ]);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/v1/payments/search?external_reference=mp_abc-123&sort=date_created&criteria=desc');
    expect(opts.headers.Authorization).toBe('Bearer test-token');
  });

  it('returns an empty array when MercadoPago has no matching payment', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) }) as unknown as typeof fetch;
    const { searchMpPayments } = require('../src/lib/mercadopago');
    expect(await searchMpPayments('mp_none')).toEqual([]);
  });

  it('throws when the MercadoPago API responds with an error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'server error' }) as unknown as typeof fetch;
    const { searchMpPayments } = require('../src/lib/mercadopago');
    await expect(searchMpPayments('mp_abc')).rejects.toThrow('MercadoPago search payments error');
  });

  it('throws when MERCADOPAGO_ACCESS_TOKEN is not configured', async () => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    const { searchMpPayments } = require('../src/lib/mercadopago');
    await expect(searchMpPayments('mp_abc')).rejects.toThrow('MERCADOPAGO_ACCESS_TOKEN must be set');
  });
});
