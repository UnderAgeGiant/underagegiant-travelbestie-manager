import { Request, Response, NextFunction } from 'express';
import { ITripRepository } from '../../repositories/interfaces/trip.repository';
import { ICollaboratorRepository } from '../../repositories/interfaces/collaborator.repository';
import { Trip } from '../../types';

export function makeAttachCollaboratorTrips(tripsRepo: ITripRepository, collaboratorRepo: ICollaboratorRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const owned = (req.result as Trip[]) ?? [];
      const refs = await collaboratorRepo.findAcceptedTripsForUser(req.user!.userId);
      const collabTrips = (await Promise.all(refs.map(async (ref): Promise<Trip | null> => {
        const trip = await tripsRepo.findById(ref.tripId);
        if (!trip) return null;
        return { ...trip, isCollaborator: true, ownerName: ref.ownerName, ownerEmail: ref.ownerEmail };
      }))).filter((t): t is Trip => t !== null);
      req.result = [...owned, ...collabTrips];
      next();
    } catch (err) { next(err); }
  };
}
