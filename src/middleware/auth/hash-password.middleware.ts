import { Request, Response, NextFunction } from 'express';
import { hashPassword } from '../../lib/password';

export async function hashPasswordMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    req.body.passwordHash = await hashPassword(req.body.password as string);
    next();
  } catch (err) { next(err); }
}
