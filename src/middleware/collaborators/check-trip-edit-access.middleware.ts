import { Request, Response, NextFunction } from 'express';
import { ICollaboratorRepository } from '../../repositories/interfaces/collaborator.repository';
import { respondError } from '../../lib/respond-error';

export function makeCheckTripEditAccess(collaboratorRepo: ICollaboratorRepository) {
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
        respondError(req, res, 404, { error: 'Trip not found' });
        return;
      }
      next();
    } catch (err) { next(err); }
  };
}
