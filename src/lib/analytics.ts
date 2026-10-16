import { waitUntil } from '@vercel/functions';
import { logger } from './logger';

type Props = Record<string, unknown>;

// Never let an email reach the third party (cta_login/register/password_reset carry
// `email`, cta_collaborator_invite carries `invitedEmail`). stdout logs keep them.
const PII_KEY = /email/i;

function scrub(props: Props): Props {
  return Object.fromEntries(Object.entries(props).filter(([key]) => !PII_KEY.test(key)));
}

function send(event: string, distinctId: string, properties: Props): void {
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) return;
  const host = process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com';
  const body = JSON.stringify({
    api_key: apiKey,
    batch: [{
      event,
      distinct_id: distinctId,
      timestamp: new Date().toISOString(),
      properties: { ...scrub(properties), environment: process.env.VERCEL_ENV ?? 'local' },
    }],
  });
  // ponytail: one HTTP call per event, batch per request if volume ever matters.
  waitUntil(
    fetch(`${host}/batch/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(2000),
    })
      .then(res => {
        if (!res.ok) logger.warn({ event: 'analytics_failed', analyticsEvent: event, status: res.status });
      })
      .catch(err => {
        logger.warn({ event: 'analytics_failed', analyticsEvent: event, error: String(err) });
      }),
  );
}

/** Fire-and-forget product-analytics event. No-op without POSTHOG_API_KEY or an id. */
export function capture(distinctId: string | null, event: string, properties: Props = {}): void {
  if (!distinctId) return;
  send(event, distinctId, properties);
}

/** Links a pre-login anonymous id to the account so funnels survive login. */
export function alias(anonymousId: string | null, userId: string | null): void {
  if (!anonymousId || !userId || anonymousId === userId) return;
  send('$create_alias', userId, { alias: anonymousId });
}
