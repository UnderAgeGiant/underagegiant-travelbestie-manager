import { Request, Response, NextFunction } from 'express';
import { seoSharedCacheKey, seoCityPlansCacheKey, SEO_SITEMAP_CACHE_KEY } from '../../lib/seo';
import { feedFirstPageCacheKey } from '../../controllers/trip.controller';

/** After an unpublish (§2.6b): drop every public cache that can still list the plan, so it disappears at once:
 *  `/seo/shared/:oldId`, the first `/feed` page (2 h TTL), the sitemap, and `/seo/city/:cityId/plans` for each stop city.
 *  Reads req.trip as loaded before the clear. Redis is lazy-loaded and non-fatal.
 *  ponytail: deeper /feed pages are keyed by cursor, so they still age out on their 300 s TTL; SCAN feed:v2:* if that matters. */
export async function evictUnsharedCaches(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const trip = req.trip;
  if (trip?.shareId) {
    const cityKeys = [...new Set(trip.stops.map(s => s.cityId))].map(seoCityPlansCacheKey);
    try {
      const { redis } = await import('../../lib/redis');
      await redis.del(seoSharedCacheKey(trip.shareId), feedFirstPageCacheKey(), SEO_SITEMAP_CACHE_KEY, ...cityKeys);
    } catch { /* non-fatal: each entry expires on its own TTL */ }
  }
  next();
}
