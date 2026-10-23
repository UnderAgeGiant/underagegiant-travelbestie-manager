// USD-based exchange rates for trip cost estimates (Feature 74, contracts §18.2).
// Redis first (fx:usd, 1 day), then the upstream open.er-api.com; on upstream failure
// the last good copy (fx:usd:last, no TTL) or a USD-only fallback. Never throws.

export interface UsdRates {
  base: 'USD';
  rates: Record<string, number>;
  fetchedAt: string | null;
}

const FX_KEY = 'fx:usd';
const FX_LAST_KEY = 'fx:usd:last';
const FX_TTL_SECONDS = 86400;
const FX_URL = 'https://open.er-api.com/v6/latest/USD';
const FX_FETCH_TIMEOUT_MS = 5000;
const FALLBACK: UsdRates = { base: 'USD', rates: { USD: 1 }, fetchedAt: null };

// Lazy: keeps the shared ioredis client out of modules that only import the types.
function redis() {
  return (require('./redis') as typeof import('./redis')).redis;
}

async function readCopy(key: string): Promise<UsdRates | null> {
  try {
    const raw = await redis().get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UsdRates;
    return parsed && typeof parsed.rates === 'object' ? parsed : null;
  } catch {
    return null; // Redis down or a corrupt copy counts as a miss
  }
}

async function writeCopy(key: string, value: UsdRates, ttlSeconds?: number): Promise<void> {
  try {
    const json = JSON.stringify(value);
    if (ttlSeconds) await redis().set(key, json, 'EX', ttlSeconds);
    else await redis().set(key, json);
  } catch {
    // Non-fatal: the caller already has the rates in hand
  }
}

async function fetchUpstream(): Promise<UsdRates> {
  const res = await fetch(FX_URL, { signal: AbortSignal.timeout(FX_FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`fx upstream HTTP ${res.status}`);
  const body = await res.json() as { result?: string; rates?: Record<string, number> };
  if (body.result !== 'success' || !body.rates || typeof body.rates !== 'object') {
    throw new Error('fx upstream returned no rates');
  }
  return { base: 'USD', rates: body.rates, fetchedAt: new Date().toISOString() };
}

export async function getUsdRates(): Promise<UsdRates> {
  const cached = await readCopy(FX_KEY);
  if (cached) return cached;

  try {
    const fresh = await fetchUpstream();
    await writeCopy(FX_KEY, fresh, FX_TTL_SECONDS);
    await writeCopy(FX_LAST_KEY, fresh);
    return fresh;
  } catch {
    return (await readCopy(FX_LAST_KEY)) ?? FALLBACK;
  }
}
