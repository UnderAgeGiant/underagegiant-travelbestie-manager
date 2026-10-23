import { Request, Response, NextFunction } from 'express';
import { ICollaboratorRepository } from '../../repositories/interfaces/collaborator.repository';
import { respondError } from '../../lib/respond-error';

/** Owner or accepted collaborator passes. Anyone else gets `deniedStatus`: 404 (default, hides the trip) or 403 (estimate route). */
export function makeCheckTripEditAccess(collaboratorRepo: ICollaboratorRepository, deniedStatus: 403 | 404 = 404) {
  const deniedBody = deniedStatus === 403
    ? { error: 'No tienes acceso a este viaje' }
    : { error: 'Trip not found' };
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
      const isCollaborator = await collaboratorRepo.isAcceptedCollaborator(req.trip.id, req.user!.userId);
      if (!isCollaborator) {
        respondError(req, res, deniedStatus, deniedBody);
        return;
      }
      next();
    } catch (err) { next(err); }
  };
}
