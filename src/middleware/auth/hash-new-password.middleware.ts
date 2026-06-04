import { Request, Response, NextFunction } from 'express';
import * as bcrypt from 'bcryptjs';

export async function hashNewPasswordMiddleware(
  req: Request, _res: Response, next: NextFunction,
): Promise<void> {
  if (!req.body.newPassword) { next(); return; }
  req.newPasswordHash = await bcrypt.hash(req.body.newPassword as string, 10);
  next();
}
