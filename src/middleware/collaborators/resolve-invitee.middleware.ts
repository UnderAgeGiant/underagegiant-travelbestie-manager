import { Request, Response, NextFunction } from 'express';
import { IUserRepository } from '../../repositories/interfaces/user.repository';
import { respondError } from '../../lib/respond-error';

export function makeResolveInvitee(userRepo: IUserRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body as { email: string };
      const invitedUser = await userRepo.findByEmail(email);
      if (!invitedUser) {
        respondError(req, res, 404, { error: 'No existe una cuenta con ese correo' });
        return;
      }
      req.invitedUser = invitedUser;
      next();
    } catch (err) { next(err); }
  };
}
