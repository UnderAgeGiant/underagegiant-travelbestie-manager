import { randomInt } from 'crypto';
import { redis } from './redis';

const OTP_TTL_SECONDS = 300; // 5 minutes

export type OtpScope = 'register' | 'profile' | 'reset';

function otpKeyFor(scope: OtpScope, email: string): string {
  return `otp:${scope}:${email.toLowerCase()}`;
}

export function generateOtpCode(): string {
  // crypto.randomInt is uniform and cryptographically secure; upper bound is exclusive.
  return randomInt(100000, 1000000).toString();
}

export async function storeOtpFor(scope: OtpScope, email: string, code: string): Promise<void> {
  await redis.set(otpKeyFor(scope, email), JSON.stringify({ code }), 'EX', OTP_TTL_SECONDS);
}

export async function getStoredOtpCodeFor(scope: OtpScope, email: string): Promise<string | null> {
  const raw = await redis.get(otpKeyFor(scope, email));
  if (!raw) return null;
  return (JSON.parse(raw) as { code: string }).code;
}

export async function deleteOtpFor(scope: OtpScope, email: string): Promise<void> {
  await redis.del(otpKeyFor(scope, email));
}
