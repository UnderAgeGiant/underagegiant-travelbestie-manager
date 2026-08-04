import { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis';
import { companionBoostKey, COMPANION_BOOST_DURATION_SECONDS } from '../lib/companion-suggest';

export class CompanionController {
  boost = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await redis.set(companionBoostKey(req.user!.userId), '1', 'EX', COMPANION_BOOST_DURATION_SECONDS);
      req.result = { boosted: true, secondsRemaining: COMPANION_BOOST_DURATION_SECONDS };
      next();
    } catch (err) { next(err); }
  };

  /** A single TTL read gives both the boolean and the countdown value — ioredis's TTL
   *  command returns -2 when the key doesn't exist, -1 if it exists with no expiry
   *  (never the case here, since boost() always sets one), else seconds remaining. */
  status = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const ttl = await redis.ttl(companionBoostKey(req.user!.userId));
      req.result = { boosted: ttl > 0, secondsRemaining: Math.max(0, ttl) };
    } catch {
      req.result = { boosted: false, secondsRemaining: 0 };
    }
    next();
  };
}
