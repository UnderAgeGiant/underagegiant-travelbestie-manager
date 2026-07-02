import { Request, Response, NextFunction } from 'express';
import { verifyPassword } from '../../lib/password';

// Generic error for both "no such user" and "wrong password" so the response
// does not reveal whether an account exists (B-2 enumeration).
export async function verifyPasswordMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const INVALID = { code: 'INVALID_CREDENTIALS', error: 'Email o contraseña incorrectos' };
    if (!req.foundUser) { res.status(401).json(INVALID); return; }
    const ok = await verifyPassword(req.body.password as string, req.foundUser.passwordHash);
    if (!ok) { res.status(401).json(INVALID); return; }
    next();
  } catch (err) { next(err); }
}
