const PAYPAL_BASE = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret   = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set');

  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const res  = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method:  'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal token error: ${res.status} ${await res.text()}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export async function createPayPalOrder(price: string, packageId: string): Promise<string> {
  const token = await getAccessToken();
  const res   = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: packageId,
        amount:       { currency_code: 'USD', value: price },
        description:  `Tripilove Karma — ${packageId}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`PayPal create order error: ${res.status} ${await res.text()}`);
  const data = await res.json() as { id: string };
  return data.id;
}

export async function capturePayPalOrder(orderId: string): Promise<{ captureId: string }> {
  const token = await getAccessToken();
  const res   = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`PayPal capture error: ${res.status} ${await res.text()}`);
  const data = await res.json() as {
    status: string;
    purchase_units: Array<{ payments: { captures: Array<{ id: string }> } }>;
  };
  const captureId = data.purchase_units[0]?.payments?.captures[0]?.id;
  if (!captureId) throw new Error('PayPal capture: no capture ID in response');
  return { captureId };
}
