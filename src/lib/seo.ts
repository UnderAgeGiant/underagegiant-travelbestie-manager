import { CITY_NAMES } from '../data/cities';
import type { SeoSharedRow, SeoSharedSummary, SeoCityPlanRow, SeoCityPlan } from '../types';

/**
 * Shared plans with fewer planned attractions than this are thin content: `noindex` and kept out of
 * the sitemap. MIRRORS `SEO_MIN_ATTRACTIONS` in the frontend's `src/app/core/seo/seo.util.ts` — change both together.
 */
export const SEO_MIN_ATTRACTIONS = 3;
export const SEO_SITEMAP_LIMIT = 5000;
export const SEO_SITEMAP_CACHE_KEY = 'seo:sitemap';
export const SEO_SHARED_CACHE_TTL = 600;
export const SEO_SITEMAP_CACHE_TTL = 3600;

/** GET /seo/city/:cityId/plans — how many real shared itineraries to surface per city, and how long to cache them. */
export const SEO_CITY_PLANS_LIMIT = 6;
export const SEO_CITY_PLANS_CACHE_TTL = 600;
/** Same shape as curated catalog city ids (attractions-curated.ts keys). */
export const SEO_CITY_ID_PATTERN = /^[a-z0-9_]{1,40}$/;

export function seoSharedCacheKey(shareId: string): string {
  return `seo:shared:${shareId}`;
}

export function seoCityPlansCacheKey(cityId: string): string {
  return `seo:cityplans:${cityId}`;
}

/**
 * True when at least one city id resolves to a display name. This is half of the "indexable" rule
 * (the other half is SEO_MIN_ATTRACTIONS) — shared by buildSeoSummary() and the sitemap controller so
 * the sitemap lists exactly the plans /seo/shared/:id would mark indexable.
 */
export function hasKnownCity(cityIds: string[]): boolean {
  return cityIds.some(id => Boolean(CITY_NAMES[id]));
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

/** Maps city ids to display names (deduped), dropping any plan whose cities are all unknown. */
export function buildSeoCityPlans(rows: SeoCityPlanRow[]): SeoCityPlan[] {
  const out: SeoCityPlan[] = [];
  for (const r of rows) {
    const cities = [...new Set(r.cityIds.map(id => CITY_NAMES[id]).filter((n): n is string => Boolean(n)))];
    if (cities.length === 0) continue;
    out.push({ id: r.id, tripName: r.tripName, cities, attractionCount: r.attractionCount, favoriteCount: r.favoriteCount });
  }
  return out;
}
