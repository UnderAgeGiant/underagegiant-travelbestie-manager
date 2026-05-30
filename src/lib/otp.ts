import { redis } from './redis';

const OTP_TTL_SECONDS = 300; // 5 minutes
const OTP_KEY_PREFIX = 'REGISTER_OTP_';

export function otpKey(email: string): string {
  return `${OTP_KEY_PREFIX}${email.toLowerCase()}`;
}

export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function storeOtp(email: string, code: string): Promise<void> {
  await redis.set(otpKey(email), JSON.stringify({ code }), 'EX', OTP_TTL_SECONDS);
}

export async function getStoredOtpCode(email: string): Promise<string | null> {
  const raw = await redis.get(otpKey(email));
  if (!raw) return null;
  return (JSON.parse(raw) as { code: string }).code;
}

export async function deleteOtp(email: string): Promise<void> {
  await redis.del(otpKey(email));
}
