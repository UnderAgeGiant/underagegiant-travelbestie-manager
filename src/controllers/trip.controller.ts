import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ITripRepository } from '../repositories/interfaces/trip.repository';
import { TripStop, TransitLeg } from '../types';

export class TripController {
  constructor(private readonly trips: ITripRepository) {}

  create = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title, stops, transits } = req.body as { title: string; stops: TripStop[]; transits: TransitLeg[] };
      req.trip = await this.trips.create({ title, stops, transits: transits ?? [], ownerId: req.user!.userId });
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
}
