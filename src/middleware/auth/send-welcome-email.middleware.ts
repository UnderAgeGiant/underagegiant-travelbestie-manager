import { Request, Response, NextFunction } from 'express';
import { waitUntil } from '@vercel/functions';
import { sendWelcomeEmail } from '../../lib/email';
import { logger } from '../../lib/logger';

export const sendWelcomeEmailMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const { name, email } = req.foundUser ?? {};
  if (name && email) {
    waitUntil(
      sendWelcomeEmail(email, name).catch((err: Error) =>
        logger.error({ msg: 'welcome email failed', email, err: err.message })
      )
    );
  }
  next();
};
