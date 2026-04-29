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
}
