import { Request, Response, NextFunction } from 'express';
import { respondError } from '../../lib/respond-error';
import { REFERRAL_CODE_RE } from '../../lib/referrals';

/** GET /referrals/:code: a malformed code is 404 before any query (same body as unknown, §19.2). */
export function rejectMalformedCode(req: Request, res: Response, next: NextFunction): void {
  if (!REFERRAL_CODE_RE.test(req.params.code)) { respondError(req, res, 404, { error: 'not_found' }); return; }
  next();
}

/** After findInviter: unknown code → 404. */
export function requireInviter(req: Request, res: Response, next: NextFunction): void {
  if (!req.result) { respondError(req, res, 404, { error: 'not_found' }); return; }
  next();
}
