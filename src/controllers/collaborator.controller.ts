import { Request, Response, NextFunction } from 'express';
import { ICollaboratorRepository } from '../repositories/interfaces/collaborator.repository';

export class CollaboratorController {
  constructor(private readonly collaborators: ICollaboratorRepository) {}

  invite = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const invitedAt = await this.collaborators.invite(req.trip!.id, req.invitedUser!.id);
      req.result = {
        userId: req.invitedUser!.id,
        name: req.invitedUser!.name,
        email: req.invitedUser!.email,
        invitedAt,
        acceptedAt: null,
      };
      next();
    } catch (err) { next(err); }
  };

  accept = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.collaboratorAccepted = await this.collaborators.accept(req.trip!.id, req.user!.userId);
      next();
    } catch (err) { next(err); }
  };

  remove = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.collaborators.remove(req.trip!.id, req.params.userId);
      next();
    } catch (err) { next(err); }
  };

  listForTrip = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.result = await this.collaborators.listForTrip(req.trip!.id);
      next();
    } catch (err) { next(err); }
  };

  listPendingForUser = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.result = await this.collaborators.listPendingForUser(req.user!.userId);
      next();
    } catch (err) { next(err); }
  };
}
