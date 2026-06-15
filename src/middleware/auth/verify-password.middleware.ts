import { Request, Response, NextFunction } from 'express';
import { verifyPassword } from '../../lib/password';

export async function verifyPasswordMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.foundUser) { res.status(401).json({ code: 'USER_NOT_FOUND', error: 'No account found with that email' }); return; }
    const ok = await verifyPassword(req.body.password as string, req.foundUser.passwordHash);
    if (!ok) { res.status(401).json({ code: 'WRONG_PASSWORD', error: 'Incorrect password' }); return; }
    next();
  } catch (err) { next(err); }
}
