import { Request, Response, NextFunction } from 'express';
import { signToken } from '../../lib/jwt';

export async function signRefreshedTokenMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user  = req.foundUser!;
    const token = signToken({ userId: user.id, email: user.email, name: user.name });
    // validateAndRotate already wrote the new refresh token key in Redis;
    // we return the raw token that was set during rotation.
    req.result = { token, refreshToken: req.newRawRefreshToken, user: { name: user.name, email: user.email } };
    next();
  } catch (err) { next(err); }
}
