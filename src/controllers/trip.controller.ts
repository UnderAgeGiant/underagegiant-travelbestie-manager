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
}
