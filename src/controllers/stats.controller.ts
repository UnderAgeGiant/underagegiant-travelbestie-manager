import { Request, Response, NextFunction } from 'express';
import { IStatsRepository } from '../repositories/interfaces/stats.repository';

export class StatsController {
  constructor(private readonly stats: IStatsRepository) {}

  get = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.result = await this.stats.get();
      next();
    } catch (err) { next(err); }
  };
}
