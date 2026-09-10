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
