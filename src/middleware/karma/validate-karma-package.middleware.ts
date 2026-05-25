import { Request, Response, NextFunction } from 'express';
import { findPackage } from '../../lib/karma-packages';

export const validateKarmaPackage = (req: Request, res: Response, next: NextFunction): void => {
  const { packageId } = req.body as { packageId?: string };
  if (!packageId || !findPackage(packageId)) {
    res.status(400).json({ error: 'Invalid packageId' });
    return;
  }
  next();
};
