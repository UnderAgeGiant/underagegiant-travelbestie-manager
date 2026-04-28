import { Request, Response, NextFunction } from 'express';
import { signToken } from '../../lib/jwt';

export function signTokenMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const user = req.foundUser!;
  const token = signToken({ userId: user.id, email: user.email, name: user.name });
  req.result = { token, user: { name: user.name, email: user.email } };
  next();
}
