import { Request, Response, NextFunction } from 'express';
import { seoSharedCacheKey } from '../../lib/seo';

/** After an unpublish: drop the old share id's `/seo/shared` cache so its title/cities stop serving at once.
 *  Reads req.trip.shareId as loaded before the clear. Redis is lazy-loaded and non-fatal.
 *  ponytail: feed (300 s, first page 7200 s), sitemap (3600 s) and city-plans (600 s) caches still age out on their TTL. */
export async function evictSeoSharedCache(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const shareId = req.trip?.shareId;
  if (shareId) {
    try {
      const { redis } = await import('../../lib/redis');
      await redis.del(seoSharedCacheKey(shareId));
    } catch { /* non-fatal: the entry expires within SEO_SHARED_CACHE_TTL */ }
  }
  next();
}
