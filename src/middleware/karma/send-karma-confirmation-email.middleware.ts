import { Request, Response, NextFunction } from 'express';
import { waitUntil } from '@vercel/functions';
import { sendKarmaConfirmationEmail } from '../../lib/email';
import { findPackage } from '../../lib/karma-packages';
import { logger } from '../../lib/logger';
import { CompleteKarmaPurchaseResult } from '../../types';

export const sendKarmaConfirmationEmailMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const { name, email } = req.user ?? {};
  const purchase = req.karmaPurchase;
  const result = req.result as CompleteKarmaPurchaseResult | undefined;

  if (name && email && purchase?.providerCaptureId) {
    const pkg = findPackage(purchase.packageId);
    const label = pkg?.label ?? `${purchase.karmaAmount} Karma`;
    const newBalance = result?.newKarmaTotal ?? purchase.karmaAmount;

    waitUntil(
      sendKarmaConfirmationEmail(
        email, name,
        purchase.karmaAmount,
        label,
        purchase.amount,
        purchase.currency,
        purchase.providerCaptureId,
        newBalance,
      ).catch((err: Error) =>
        logger.error({ msg: 'karma confirmation email failed', email, err: err.message })
      )
    );
  }

  next();
};
