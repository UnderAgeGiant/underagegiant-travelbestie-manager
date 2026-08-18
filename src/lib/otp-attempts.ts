import { redis } from './redis';
import { OtpScope } from './otp';

export const MAX_OTP_ATTEMPTS = 5;
const ATTEMPT_TTL = 900; // 15 minutes

function attemptsKey(scope: OtpScope, email: string): string {
  return `otp:attempts:${scope}:${email.toLowerCase()}`;
}

/** Increment the failed-verify counter for this email/scope.
 *  Returns true when the caller should reject (limit exceeded). Fail-open on Redis error. */
export async function registerFailedAttempt(scope: OtpScope, email: string): Promise<boolean> {
  try {
    const count = await redis.incr(attemptsKey(scope, email));
    if (count === 1) await redis.expire(attemptsKey(scope, email), ATTEMPT_TTL);
    return count > MAX_OTP_ATTEMPTS;
  } catch {
    return false; // Redis unavailable — never lock users out on an outage
  }
}

/** Clear the counter after a successful verification. Non-fatal on error. */
export async function clearAttempts(scope: OtpScope, email: string): Promise<void> {
  try { await redis.del(attemptsKey(scope, email)); } catch { /* non-fatal */ }
}
