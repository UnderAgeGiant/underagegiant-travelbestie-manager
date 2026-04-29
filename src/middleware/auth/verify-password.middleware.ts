import { Request, Response, NextFunction } from 'express';
import { verifyPassword } from '../../lib/password';

export async function verifyPasswordMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.foundUser) { res.status(401).json({ error: 'Invalid credentials' }); return; }
    const ok = await verifyPassword(req.body.password as string, req.foundUser.passwordHash);
    if (!ok) { res.status(401).json({ error: 'Invalid credentials' }); return; }
    next();
  } catch (err) { next(err); }
}
