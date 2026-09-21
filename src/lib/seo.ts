import { CITY_NAMES } from '../data/cities';
import type { SeoSharedRow, SeoSharedSummary } from '../types';

/**
 * Shared plans with fewer planned attractions than this are thin content: `noindex` and kept out of
 * the sitemap. MIRRORS `SEO_MIN_ATTRACTIONS` in the frontend's `src/app/core/seo/seo.util.ts` — change both together.
 */
export const SEO_MIN_ATTRACTIONS = 3;
export const SEO_SITEMAP_LIMIT = 5000;
export const SEO_SITEMAP_CACHE_KEY = 'seo:sitemap';
export const SEO_SHARED_CACHE_TTL = 600;
export const SEO_SITEMAP_CACHE_TTL = 3600;

export function seoSharedCacheKey(shareId: string): string {
  return `seo:shared:${shareId}`;
}

export function buildSeoSummary(row: SeoSharedRow): SeoSharedSummary {
  const names = row.cityIds.map(id => CITY_NAMES[id]).filter((n): n is string => Boolean(n));
  const cities = [...new Set(names)];
  return {
    id: row.id,
    tripName: row.tripName,
    cities,
    attractionCount: row.attractionCount,
    updatedAt: row.updatedAt,
    indexable: row.attractionCount >= SEO_MIN_ATTRACTIONS && cities.length > 0,
  };
}
