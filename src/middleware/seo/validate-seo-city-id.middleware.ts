import { Request, Response, NextFunction } from 'express';
import { respondError } from '../../lib/respond-error';
import { SEO_CITY_ID_PATTERN } from '../../lib/seo';

/** 400 unless :cityId matches the curated-catalog city id shape (lowercase alphanumeric/underscore, 1-40 chars). */
export function validateSeoCityId(req: Request, res: Response, next: NextFunction): void {
  if (!SEO_CITY_ID_PATTERN.test(String(req.params.cityId))) {
    respondError(req, res, 400, { error: 'Invalid city id' });
    return;
  }
  next();
}
