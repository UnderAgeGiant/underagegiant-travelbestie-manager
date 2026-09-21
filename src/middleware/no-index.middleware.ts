import { Request, Response, NextFunction } from 'express';

/** The API host serves JSON only — keep it (and its error pages) out of search indexes. */
export function noIndexApi(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
}

export function robotsTxt(_req: Request, res: Response): void {
  res.type('text/plain').send('User-agent: *\nDisallow: /\n');
}
