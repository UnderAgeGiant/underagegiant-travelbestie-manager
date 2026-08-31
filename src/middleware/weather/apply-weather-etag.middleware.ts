import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { WeatherResponseDay } from '../../types';

export function applyWeatherEtag(req: Request, res: Response, next: NextFunction): void {
  const { days } = req.result as { days: WeatherResponseDay[] };
  const hash = createHash('sha256').update(JSON.stringify(days)).digest('hex');
  const etag = `"${hash}"`;

  res.set('Cache-Control', 'no-store');

  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }

  res.set('ETag', etag);
  next();
}
