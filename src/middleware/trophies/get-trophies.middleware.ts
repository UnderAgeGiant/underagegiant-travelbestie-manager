import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ITrophyRepository } from '../../repositories/interfaces/trophy.repository';
import { TrophiesResponse } from '../../types';

export function makeGetTrophies(repo: ITrophyRepository): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const [earned, progress] = await Promise.all([repo.listEarned(userId), repo.progress(userId)]);
      req.result = { earned, progress } satisfies TrophiesResponse;
      next();
    } catch (err) { next(err); }
  };
}
