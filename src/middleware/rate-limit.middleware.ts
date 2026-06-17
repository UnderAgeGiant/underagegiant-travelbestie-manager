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
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
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
