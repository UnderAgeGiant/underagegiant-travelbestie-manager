import { Request, Response, NextFunction } from 'express';
import { IRankingRepository } from '../repositories/interfaces/ranking.repository';
import { santiagoWeekStart } from '../lib/rankings';

export class RankingController {
  constructor(private readonly rankings: IRankingRepository) {}

  weekly = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.result = await this.rankings.getWeekly(santiagoWeekStart());
      next();
    } catch (err) { next(err); }
  };

  mine = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.result = await this.rankings.getMine(santiagoWeekStart(), req.user!.userId);
      next();
    } catch (err) { next(err); }
  };
}
