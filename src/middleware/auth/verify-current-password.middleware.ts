import { Request, Response, NextFunction } from 'express';
import * as bcrypt from 'bcryptjs';

export async function verifyCurrentPasswordMiddleware(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  if (!req.body.newPassword) { next(); return; }

  const currentPassword = req.body.currentPassword as string | undefined;
  if (!currentPassword) {
    res.status(400).json({ error: 'Se requiere la contraseña actual para cambiarla.' });
    return;
  }

  const match = await bcrypt.compare(currentPassword, req.foundUser!.passwordHash);
  if (!match) {
    res.status(400).json({ error: 'La contraseña actual es incorrecta.' });
    return;
  }
  next();
}
