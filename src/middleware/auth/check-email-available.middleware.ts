import { Request, Response, NextFunction } from 'express';

export function checkEmailAvailable(req: Request, res: Response, next: NextFunction): void {
  if (req.foundUser) { res.status(400).json({ error: 'Email already taken' }); return; }
  next();
}
