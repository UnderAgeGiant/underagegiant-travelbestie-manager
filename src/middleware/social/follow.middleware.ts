import { Request, Response, NextFunction, RequestHandler } from 'express';
import { IFollowRepository } from '../../repositories/interfaces/follow.repository';

export function makeFollow(repo: IFollowRepository): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try { await repo.follow(req.user!.userId, req.targetUser!.id); next(); } catch (err) { next(err); }
  };
}

export function makeUnfollow(repo: IFollowRepository): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try { await repo.unfollow(req.user!.userId, req.targetUser!.id); next(); } catch (err) { next(err); }
  };
}
