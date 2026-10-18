import { Request, Response, NextFunction } from 'express';
import { IGameRepository } from '../repositories/interfaces/game.repository';
import { santiagoWeekStart } from '../lib/rankings';

export class GameController {
  constructor(private readonly games: IGameRepository) {}

  saveBest = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.result = await this.games.saveBest(req.user!.userId, santiagoWeekStart(), req.body.score);
      next();
    } catch (err) { next(err); }
  };
}
