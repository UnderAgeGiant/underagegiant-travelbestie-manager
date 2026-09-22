import { randomUUID, createHash } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ITripRepository } from '../repositories/interfaces/trip.repository';
import { TripStop, TransitLeg } from '../types';
import {
  SEO_MIN_ATTRACTIONS, SEO_SITEMAP_LIMIT, SEO_SITEMAP_CACHE_KEY,
  SEO_SHARED_CACHE_TTL, SEO_SITEMAP_CACHE_TTL, seoSharedCacheKey, hasKnownCity,
  SEO_CITY_PLANS_LIMIT, SEO_CITY_PLANS_CACHE_TTL, seoCityPlansCacheKey, buildSeoCityPlans,
} from '../lib/seo';

export class TripController {
  constructor(private readonly trips: ITripRepository) {}

  create = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title, stops, transits, sourceAiPlanRequestId, sourcePlanSessionId } = req.body as {
        title: string; stops: TripStop[]; transits: TransitLeg[];
        sourceAiPlanRequestId?: string; sourcePlanSessionId?: string;
      };
      req.trip = await this.trips.create({
        title, stops, transits: transits ?? [], ownerId: req.user!.userId,
        sourceAiPlanRequestId, sourcePlanSessionId,
      });
      next();
    } catch (err) { next(err); }
  };

  findByOwner = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.result = await this.trips.findByOwner(req.user!.userId);
      next();
    } catch (err) { next(err); }
  };

  findById = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.trip = await this.trips.findById(req.params.id) ?? undefined;
      next();
    } catch (err) { next(err); }
  };

  update = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title, stops, transits } = req.body as Partial<{ title: string; stops: TripStop[]; transits: TransitLeg[] }>;
      req.trip = (await this.trips.update(req.params.id, { title, stops, transits })) ?? undefined;
      next();
    } catch (err) { next(err); }
  };

  delete = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.trips.delete(req.params.id);
      next();
    } catch (err) { next(err); }
  };

  recordExport = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.trips.setExportedAt(req.trip!.id);
      next();
    } catch (err) { next(err); }
  };

  shareIfAlreadyShared = (req: Request, res: Response, next: NextFunction): void => {
    if (req.trip!.shareId) {
      res.status(200).json({ shareId: req.trip!.shareId });
      return;
    }
    next();
  };

  createShare = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const shareId = randomUUID();
      req.trip = (await this.trips.setShareId(req.trip!.id, shareId)) ?? undefined;
      req.result = { shareId };
      next();
    } catch (err) { next(err); }
  };

  searchShared = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      let q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (q.length > 100) q = q.slice(0, 100);
      req.result = await this.trips.searchShared(q);
      next();
    } catch (err) { next(err); }
  };

  findByShareId = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.trips.findByShareId(req.params.shareId);
      if (!data) {
        const err = Object.assign(new Error('Shared trip not found'), { status: 404 });
        next(err);
        return;
      }
      req.result = data;
      next();
    } catch (err) { next(err); }
  };

  findManyFeatured = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const ids = (process.env.FEATURED_TRIP_IDS ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const { redis } = await import('../lib/redis');
      const CACHE_KEY = 'feature:videos';
      const CACHE_TTL = 86400; // 24 hours

      try {
        const cached = await redis.get(CACHE_KEY);
        if (cached) {
          req.result = JSON.parse(cached);
          return next();
        }
      } catch { /* non-fatal — fall through to DB */ }

      const trips = await this.trips.findManyByShareIds(ids);

      try {
        await redis.set(CACHE_KEY, JSON.stringify(trips), 'EX', CACHE_TTL);
      } catch { /* non-fatal */ }

      req.result = trips;
      next();
    } catch (err) { next(err); }
  };

  /** GET /feed — Redis cache-aside (identical for every caller: no per-viewer fields). */
  listFeed = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { cursor, limit } = req.feedQuery!;
      const rawCursor = typeof req.query.cursor === 'string' ? req.query.cursor : '';
      const cacheKey = `feed:${limit}:${createHash('sha256').update(rawCursor || 'first').digest('hex')}`;
      const { redis } = await import('../lib/redis');

      try {
        const cached = await redis.get(cacheKey);
        if (cached) { req.result = JSON.parse(cached); return next(); }
      } catch { /* non-fatal — fall through to DB */ }

      const page = await this.trips.listFeed(cursor, limit);

      try { await redis.set(cacheKey, JSON.stringify(page), 'EX', 300); } catch { /* non-fatal */ }

      req.result = page;
      next();
    } catch (err) { next(err); }
  };

  /** GET /seo/shared/:shareId — Redis cache-aside (hits only; 404s are never cached). Sets req.seoRow. */
  seoShared = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const shareId = String(req.params.shareId);
      const key = seoSharedCacheKey(shareId);
      const { redis } = await import('../lib/redis');
      try {
        const cached = await redis.get(key);
        if (cached) { req.seoRow = JSON.parse(cached); return next(); }
      } catch { /* non-fatal — fall through to DB */ }

      const row = await this.trips.findSeoRow(shareId);
      if (row) { try { await redis.set(key, JSON.stringify(row), 'EX', SEO_SHARED_CACHE_TTL); } catch { /* non-fatal */ } }
      req.seoRow = row;
      next();
    } catch (err) { next(err); }
  };

  /** GET /seo/sitemap — indexable shared plans, Redis cache-aside 1 h. */
  seoSitemap = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { redis } = await import('../lib/redis');
      try {
        const cached = await redis.get(SEO_SITEMAP_CACHE_KEY);
        if (cached) { req.result = JSON.parse(cached); return next(); }
      } catch { /* non-fatal */ }

      // Apply the known-city half of the indexable rule here (CITY_NAMES lives in code, not SQL) and strip
      // cityIds so the public shape stays exactly { id, updatedAt } — the sitemap then lists exactly the
      // plans /seo/shared/:id marks indexable. Note: the SQL LIMIT runs before this filter, so a page of
      // unknown-city plans could under-fill the list; harmless at current volumes.
      const rows = await this.trips.listSeoIndex(SEO_MIN_ATTRACTIONS, SEO_SITEMAP_LIMIT);
      const result = {
        items: rows.filter(r => hasKnownCity(r.cityIds)).map(({ id, updatedAt }) => ({ id, updatedAt })),
      };
      try { await redis.set(SEO_SITEMAP_CACHE_KEY, JSON.stringify(result), 'EX', SEO_SITEMAP_CACHE_TTL); } catch { /* non-fatal */ }
      req.result = result;
      next();
    } catch (err) { next(err); }
  };

  /** GET /seo/city/:cityId/plans — Redis cache-aside 10 min per city. */
  seoCityPlans = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const cityId = String(req.params.cityId);
      const key = seoCityPlansCacheKey(cityId);
      const { redis } = await import('../lib/redis');
      try {
        const cached = await redis.get(key);
        if (cached) { req.result = JSON.parse(cached); return next(); }
      } catch { /* non-fatal */ }

      const rows = await this.trips.listSeoCityPlans(cityId, SEO_MIN_ATTRACTIONS, SEO_CITY_PLANS_LIMIT);
      const result = { items: buildSeoCityPlans(rows) };
      try { await redis.set(key, JSON.stringify(result), 'EX', SEO_CITY_PLANS_CACHE_TTL); } catch { /* non-fatal */ }
      req.result = result;
      next();
    } catch (err) { next(err); }
  };
}
