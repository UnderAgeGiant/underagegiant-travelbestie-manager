import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../../lib/jwt';
import { respondError } from '../../lib/respond-error';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) { respondError(req, res, 401, { error: 'Missing or invalid Authorization header' }); return; }
  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    respondError(req, res, 401, { error: 'Token invalid or expired' });
  }
}
