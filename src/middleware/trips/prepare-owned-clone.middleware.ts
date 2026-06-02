import { Request, Response, NextFunction } from 'express';

export function prepareOwnedClone(req: Request, _res: Response, next: NextFunction): void {
  const source = req.trip!;
  req.body = {
    title:    `Copia de ${source.title}`,
    stops:    source.stops,
    transits: source.transits,
  };
  next();
}
