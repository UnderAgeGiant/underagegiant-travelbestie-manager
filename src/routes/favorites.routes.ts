import { Router } from 'express';
import { IFavoriteRepository } from '../repositories/interfaces/favorite.repository.interface';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { makeFavoriteList } from '../middleware/favorites/favorite.list.middleware';
import { respond } from '../middleware/respond.middleware';

export function createFavoritesRouter(favoriteRepo: IFavoriteRepository): Router {
  const router = Router();
  const favoriteList = makeFavoriteList(favoriteRepo);

  router.get('/',
    requireAuth,
    favoriteList,
    respond(200),
  );

  return router;
}
