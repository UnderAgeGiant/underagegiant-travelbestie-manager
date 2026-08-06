import { Request, Response, NextFunction } from 'express';
import { ICollaboratorRepository } from '../../repositories/interfaces/collaborator.repository';
import { respondError } from '../../lib/respond-error';

export function makeCheckInviteTarget(collaboratorRepo: ICollaboratorRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.invitedUser!.id === req.user!.userId) {
      respondError(req, res, 400, { error: 'No puedes invitarte a ti mismo' });
      return;
    }
    try {
      const already = await collaboratorRepo.isAlreadyInvited(req.trip!.id, req.invitedUser!.id);
      if (already) {
        respondError(req, res, 409, { error: 'Este usuario ya es colaborador o tiene una invitación pendiente' });
        return;
      }
      next();
    } catch (err) { next(err); }
  };
}
