import { Request, Response, NextFunction } from 'express';
import { signToken } from '../../lib/jwt';
import { issueRefreshToken } from '../../lib/refresh-tokens';

export async function signTokenMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user         = req.foundUser!;
    const token        = signToken({ userId: user.id, email: user.email, name: user.name });
    const refreshToken = await issueRefreshToken(user.id);
    req.result = { token, refreshToken, user: { name: user.name, email: user.email } };
    next();
  } catch (err) { next(err); }
}
