import { Request, Response, NextFunction } from 'express';
import { respondError } from '../../lib/respond-error';
import { buildSeoSummary } from '../../lib/seo';

/** 404 when the share id is unknown; otherwise shapes req.seoRow into the public PII-free summary. */
export function respondSeoSummary(req: Request, res: Response, next: NextFunction): void {
  if (!req.seoRow) { respondError(req, res, 404, { error: 'Shared trip not found' }); return; }
  req.result = buildSeoSummary(req.seoRow);
  next();
}
