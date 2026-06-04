import { Request, Response, NextFunction } from 'express';

export function checkNewEmailTaken(req: Request, res: Response, next: NextFunction): void {
  if (!req.body.newEmail) { next(); return; }

  const newEmail = (req.body.newEmail as string).toLowerCase();
  if (newEmail === req.user!.email.toLowerCase()) {
    res.status(400).json({ error: 'La nueva dirección de correo es la misma que la actual.' });
    return;
  }
  if (req.newEmailUser) {
    res.status(400).json({ error: 'La nueva dirección de correo ya está registrada.' });
    return;
  }
  next();
}
