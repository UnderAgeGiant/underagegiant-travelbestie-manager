import { redis } from './redis';
import { generateRefreshToken, hashToken } from './tokens';

export const REFRESH_TTL = 86400; // 1 day in seconds

// Window during which a just-rotated token still resolves to its replacement
// instead of failing. Multiple tabs share one refresh cookie; if two of them
// call /auth/refresh at nearly the same moment, whichever the server sees
// second would otherwise find its token already deleted and get logged out
// (see validateAndRotate below).
const ROTATION_GRACE_TTL = 10; // seconds

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

  if (!value) {
    // Not an active token — it may have just been rotated by a concurrent
    // request on this same cookie (e.g. a second open tab). Hand back the
    // same freshly-issued token rather than rejecting, so this request
    // doesn't clear a cookie the browser may already hold the new value for.
    return resolveRecentlyRotated(hash);
  }

  const [userId, storedVersion] = value.split('|');
  const currentVersion = await getSessionVersion(userId);
  if (storedVersion !== currentVersion) return null; // password was changed

  await redis.del(`refresh:${hash}`);
  const newRaw  = generateRefreshToken();
  const newHash = hashToken(newRaw);
  await redis.set(`refresh:${newHash}`, `${userId}|${currentVersion}`, 'EX', REFRESH_TTL);
  await redis.set(`rotated:${hash}`, newRaw, 'EX', ROTATION_GRACE_TTL);
  return { userId, newRaw };
}

async function resolveRecentlyRotated(oldHash: string): Promise<{ userId: string; newRaw: string } | null> {
  const newRaw = await redis.get(`rotated:${oldHash}`);
  if (!newRaw) return null;
  const newValue = await redis.get(`refresh:${hashToken(newRaw)}`);
  if (!newValue) return null; // superseded token was since revoked/logged out
  const [userId] = newValue.split('|');
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
