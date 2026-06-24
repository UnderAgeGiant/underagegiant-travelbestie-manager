import { Request, Response, NextFunction } from 'express';
import { signToken } from '../../lib/jwt';
import { issueRefreshToken } from '../../lib/refresh-tokens';
import { setRefreshCookie } from '../../lib/refresh-cookie';

export async function signTokenMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user         = req.foundUser!;
    const token        = signToken({ userId: user.id, email: user.email, name: user.name });
    const refreshToken = await issueRefreshToken(user.id);
    setRefreshCookie(res, refreshToken);
    // Refresh token is delivered via HttpOnly cookie only — never in the JSON body (F-5).
    req.result = { token, user: { name: user.name, email: user.email } };
    next();
  } catch (err) { next(err); }
}
