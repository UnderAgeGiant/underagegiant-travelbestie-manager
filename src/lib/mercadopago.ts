import { createHmac, timingSafeEqual } from 'crypto';

const MP_BASE = 'https://api.mercadopago.com';

function frontendOrigin(): string {
  const raw = process.env.FRONTEND_ORIGIN ?? 'http://localhost:4200';
  return raw.includes(',') ? raw.split(',')[0].trim() : raw;
}

/**
 * MercadoPago rejects auto_return outright when back_urls points at a local/non-public
 * domain — the API's error ("auto_return invalid. back_url.success must be defined") is
 * misleadingly worded; the real requirement is a publicly-routable domain. Local dev still
 * gets working back_urls, just without the auto-fire redirect — harmless, since the webhook
 * (not the browser redirect) is what actually completes the purchase.
 */
function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export async function createMpPreference(
  priceClp: string,
  packageId: string,
  purchaseRef: string,
): Promise<{ preferenceId: string; initPoint: string }> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN must be set');

  const origin = frontendOrigin();
  const body: Record<string, unknown> = {
    items: [{
      title:       `TripiLove Karma — ${packageId}`,
      quantity:    1,
      unit_price:  Number(priceClp),
      currency_id: 'CLP',
    }],
    external_reference: purchaseRef,
    back_urls: {
      success: `${origin}/?mp_purchase=${purchaseRef}&mp_status=success`,
      failure: `${origin}/?mp_purchase=${purchaseRef}&mp_status=failure`,
      pending: `${origin}/?mp_purchase=${purchaseRef}&mp_status=pending`,
    },
  };
  if (!isLocalOrigin(origin)) body['auto_return'] = 'approved';
  const notificationUrl = process.env.MERCADOPAGO_NOTIFICATION_URL;
  if (notificationUrl) body['notification_url'] = notificationUrl;

  const res = await fetch(`${MP_BASE}/checkout/preferences`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`MercadoPago create preference error: ${res.status} ${await res.text()}`);
  const data = await res.json() as { id: string; init_point: string };
  return { preferenceId: data.id, initPoint: data.init_point };
}

export async function fetchMpPayment(paymentId: string): Promise<{
  status: string;
  externalReference: string;
  transactionAmount: number;
}> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN must be set');

  const res = await fetch(`${MP_BASE}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`MercadoPago fetch payment error: ${res.status} ${await res.text()}`);
  const data = await res.json() as { status: string; external_reference: string; transaction_amount: number };
  return { status: data.status, externalReference: data.external_reference, transactionAmount: data.transaction_amount };
}

/**
 * Verifies MercadoPago's x-signature webhook header against MERCADOPAGO_WEBHOOK_SECRET.
 * Header format: "ts=<unix-seconds>,v1=<hmac-sha256-hex>", where the hash covers the
 * manifest string "id:<dataId>;request-id:<xRequestId>;ts:<ts>;".
 */
export function verifyMpWebhookSignature(
  xSignature: string | undefined,
  xRequestId: string | undefined,
  dataId: string,
): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret || !xSignature || !xRequestId) return false;

  const parts: Record<string, string> = {};
  for (const kv of xSignature.split(',')) {
    const [key, ...rest] = kv.trim().split('=');
    if (key) parts[key] = rest.join('=');
  }
  if (!parts.ts || !parts.v1) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${parts.ts};`;
  const expectedHex = createHmac('sha256', secret).update(manifest).digest('hex');

  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const actualBuf    = Buffer.from(parts.v1, 'hex');
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
