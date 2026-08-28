import { Request, Response, NextFunction, RequestHandler } from 'express';
import { redis } from '../lib/redis';
import { respondError } from '../lib/respond-error';

interface RateLimitOptions {
  keyPrefix: string;
  windowSeconds: number;
  maxRequests: number;
  getKey?: (req: Request) => string;
}

export function rateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  const { keyPrefix, windowSeconds, maxRequests, getKey } = options;
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identifier = getKey ? getKey(req) : (req.ip ?? 'unknown');
    const key = `${keyPrefix}:${identifier}`;
    try {
      const count = await redis.incr(key);
      // NX = only apply if the key has no TTL yet. Re-issuing this on every
      // request (not just when count === 1) makes it self-healing: if a prior
      // request's INCR succeeded but a transient Redis failure dropped its
      // EXPIRE call, the key would otherwise persist forever and count()
      // would climb past maxRequests permanently, 429ing that caller for
      // good. The next request's NX expire closes that window immediately.
      await redis.expire(key, windowSeconds, 'NX');
      if (count > maxRequests) {
        respondError(req, res, 429, { error: 'Demasiadas solicitudes. Intenta nuevamente más tarde.' });
        return;
      }
    } catch {
      // Redis unavailable — fail open so an outage never locks users out
    }
    next();
  };
}
