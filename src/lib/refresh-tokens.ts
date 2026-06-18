import { redis } from './redis';
import { generateRefreshToken, hashToken } from './tokens';

const REFRESH_TTL = 86400; // 1 day in seconds

export async function issueRefreshToken(userId: string): Promise<string> {
  const raw     = generateRefreshToken();
  const hash    = hashToken(raw);
  const version = await getSessionVersion(userId);
  await redis.set(`refresh:${hash}`, `${userId}|${version}`, 'EX', REFRESH_TTL);
  return raw;
}

export async function validateAndRotate(
  rawToken: string,
): Promise<{ userId: string; newRaw: string } | null> {
  const hash  = hashToken(rawToken);
  const value = await redis.get(`refresh:${hash}`);
  if (!value) return null;

  const [userId, storedVersion] = value.split('|');
  const currentVersion = await getSessionVersion(userId);
  if (storedVersion !== currentVersion) return null; // password was changed

  await redis.del(`refresh:${hash}`);
  const newRaw  = generateRefreshToken();
  const newHash = hashToken(newRaw);
  await redis.set(`refresh:${newHash}`, `${userId}|${currentVersion}`, 'EX', REFRESH_TTL);
  return { userId, newRaw };
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  await redis.del(`refresh:${hashToken(rawToken)}`);
}

export async function invalidateUserSessions(userId: string): Promise<void> {
  await redis.incr(`session_version:${userId}`);
}

async function getSessionVersion(userId: string): Promise<string> {
  return (await redis.get(`session_version:${userId}`)) ?? '0';
}
