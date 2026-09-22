import { Request, Response, NextFunction } from 'express';

/** The API host serves JSON only — keep it (and its error pages) out of search indexes. */
export function noIndexApi(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
}

/**
 * `X-Robots-Tag: noindex` (above) is the sole index-blocking mechanism for this host — it
 * blocks *indexing* while still permitting *crawling*. A `Disallow: /` here would additionally
 * block crawling, which breaks Google's renderer: it honors robots.txt for every subresource
 * fetch a page's own JS makes, including the frontend's client-side `GET /shared/:id` call that
 * `SharedTripComponent` needs during Google's second-pass render to build an indexable page.
 * Nothing sensitive is reachable without auth regardless of crawl access, so allowing crawling
 * here is safe. See docs/superpowers/plans-reports/2026-09-22-shared-plan-noindex-root-cause.md.
 */
export function robotsTxt(_req: Request, res: Response): void {
  res.type('text/plain').send('User-agent: *\nAllow: /\n');
}
