import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../../lib/jwt';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) { res.status(401).json({ error: 'Missing or invalid Authorization header' }); return; }
  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Token invalid or expired' });
  }
}
