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
}
