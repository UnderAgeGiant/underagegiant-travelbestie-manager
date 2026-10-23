import { Request, Response, NextFunction } from 'express';
import { ICollaboratorRepository } from '../../repositories/interfaces/collaborator.repository';
import { respondError } from '../../lib/respond-error';

/** Contract §18.1: owner or accepted collaborator may estimate; anyone else gets 403 (not 404). */
export function makeCheckTripEstimateAccess(collaboratorRepo: ICollaboratorRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.trip) {
      respondError(req, res, 404, { error: 'Trip not found' });
      return;
    }
    if (req.trip.ownerId === req.user!.userId) {
      next();
      return;
    }
    try {
      if (!(await collaboratorRepo.isAcceptedCollaborator(req.trip.id, req.user!.userId))) {
        respondError(req, res, 403, { error: 'No tienes acceso a este viaje' });
        return;
      }
      next();
    } catch (err) { next(err); }
  };
}
