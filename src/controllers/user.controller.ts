import { Request, Response, NextFunction } from 'express';
import { IUserRepository } from '../repositories/interfaces/user.repository';
import { respondError } from '../lib/respond-error';

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

  findByRefreshUser = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.foundUser = await this.users.findById(req.tokenUserId!) ?? undefined;
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

  findByRequestedUsername = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.body.username) req.usernameOwner = await this.users.findByUsername(req.body.username as string) ?? undefined;
      next();
    } catch (err) { next(err); }
  };

  /** Expects :username already lowercased + format-checked (validateUsernameParam, added with the follow routes). */
  findByUsernameParam = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.targetUser = await this.users.findByUsername(req.params.username) ?? undefined;
      next();
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const fields: { name?: string; email?: string; passwordHash?: string; countryOfResidence?: string | null; username?: string } = {};
      if (req.body.name !== undefined)               fields.name               = req.body.name as string;
      if (req.body.newEmail !== undefined)            fields.email              = (req.body.newEmail as string).toLowerCase();
      if (req.newPasswordHash !== undefined)          fields.passwordHash       = req.newPasswordHash;
      if ('countryOfResidence' in req.body) fields.countryOfResidence = req.body.countryOfResidence as string | null;
      if (req.body.username !== undefined)            fields.username           = req.body.username as string;

      if (Object.keys(fields).length === 0) {
        res.status(400).json({ error: 'Debes proporcionar al menos un campo para actualizar.' });
        return;
      }

      let updated;
      try {
        updated = await this.users.update(userId, fields);
      } catch (err) {
        // users_username_uidx: two users claimed the same name between the pre-check and the write.
        // Any other unique violation (e.g. users_email_lower_uidx on an email change) must not read as USERNAME_TAKEN.
        const pg = err as { code?: string; constraint?: string };
        if (pg.code === '23505' && pg.constraint === 'users_username_uidx') { respondError(req, res, 409, { error: 'USERNAME_TAKEN' }); return; }
        throw err;
      }
      req.result = { user: { id: updated.id, name: updated.name, email: updated.email, countryOfResidence: updated.countryOfResidence, username: updated.username, createdAt: updated.createdAt } };
      next();
    } catch (err) { next(err); }
  };

  resetPassword = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.users.update(req.foundUser!.id, { passwordHash: req.newPasswordHash! });
      req.result = { message: 'Contraseña actualizada. Ahora puedes iniciar sesión con tu nueva contraseña.' };
      next();
    } catch (err) { next(err); }
  };
}
