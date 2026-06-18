import { randomBytes, createHash } from 'crypto';

export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
