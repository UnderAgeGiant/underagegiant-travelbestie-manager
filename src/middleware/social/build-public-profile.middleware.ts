import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ITripRepository } from '../../repositories/interfaces/trip.repository';
import { IFollowRepository } from '../../repositories/interfaces/follow.repository';
import { ITrophyRepository } from '../../repositories/interfaces/trophy.repository';
import { PublicProfile } from '../../types';

// ponytail: first 50 shared trips only; add cursor paging when someone shares more.
export const PUBLIC_PROFILE_TRIPS_LIMIT = 50;

export function makeBuildPublicProfile(trips: ITripRepository, follows: IFollowRepository, trophies: ITrophyRepository): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const owner = req.targetUser!;
      const viewer = req.user?.userId;
      const [list, counts, earned, isFollowedByMe] = await Promise.all([
        trips.listSharedByOwner(owner.id, PUBLIC_PROFILE_TRIPS_LIMIT),
        follows.counts(owner.id),
        trophies.listEarned(owner.id),
        viewer && viewer !== owner.id ? follows.isFollowing(viewer, owner.id) : Promise.resolve(undefined),
      ]);
      req.result = {
        username: owner.username!,
        name: owner.name,
        ...counts,
        ...(isFollowedByMe !== undefined ? { isFollowedByMe } : {}),
        trophies: earned,
        visitedCityIds: [...new Set(list.flatMap(t => t.stops.map(s => s.cityId)))],
        trips: list,
      } satisfies PublicProfile;
      next();
    } catch (err) { next(err); }
  };
}
