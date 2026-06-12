import { Request, Response, NextFunction } from 'express';
import { IFavoriteRepository } from '../../repositories/interfaces/favorite.repository.interface';

export function makeFavoriteList(repo: IFavoriteRepository) {
  return async function favoriteList(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    req.result = await repo.list(req.user!.userId);
    next();
  };
}
