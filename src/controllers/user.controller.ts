import { Request, Response, NextFunction } from 'express';
import { IUserRepository } from '../repositories/interfaces/user.repository';

export class UserController {
  constructor(private readonly users: IUserRepository) {}

  create = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, email, passwordHash } = req.body as { name: string; email: string; passwordHash: string };
      req.foundUser = await this.users.create({ name, email, passwordHash });
      next();
    } catch (err) { next(err); }
  };

  findByEmail = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.foundUser = await this.users.findByEmail(req.body.email) ?? undefined;
      next();
    } catch (err) { next(err); }
  };

  findById = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.foundUser = await this.users.findById(req.user!.userId) ?? undefined;
      next();
    } catch (err) { next(err); }
  };

  findByNewEmail = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.body.newEmail) { next(); return; }
      req.newEmailUser = await this.users.findByEmail(req.body.newEmail as string) ?? undefined;
      next();
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const fields: { name?: string; email?: string; passwordHash?: string } = {};
      if (req.body.name !== undefined)       fields.name         = req.body.name as string;
      if (req.body.newEmail !== undefined)   fields.email        = (req.body.newEmail as string).toLowerCase();
      if (req.newPasswordHash !== undefined) fields.passwordHash = req.newPasswordHash;

      if (Object.keys(fields).length === 0) {
        res.status(400).json({ error: 'Debes proporcionar al menos un campo para actualizar.' });
        return;
      }

      const updated = await this.users.update(userId, fields);
      req.result = { user: { id: updated.id, name: updated.name, email: updated.email, createdAt: updated.createdAt } };
      next();
    } catch (err) { next(err); }
  };
}
