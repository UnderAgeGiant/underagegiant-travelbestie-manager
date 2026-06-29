import { Request, Response, NextFunction } from 'express';
import { signToken } from '../../lib/jwt';
import { setRefreshCookie } from '../../lib/refresh-cookie';

export async function signRefreshedTokenMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user  = req.foundUser!;
    const token = signToken({ userId: user.id, email: user.email, name: user.name });
    // validateAndRotate already rotated the stored token; persist the new raw value as a cookie.
    setRefreshCookie(res, req.newRawRefreshToken!);
    req.result = { token, user: { name: user.name, email: user.email, homeCity: user.homeCity } };
    next();
  } catch (err) { next(err); }
}
