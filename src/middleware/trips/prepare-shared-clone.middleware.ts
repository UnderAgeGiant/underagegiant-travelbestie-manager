import { Request, Response, NextFunction } from 'express';
import { SharedTripPayload } from '../../types';

export function prepareSharedClone(req: Request, _res: Response, next: NextFunction): void {
  const source = req.result as SharedTripPayload;
  req.body = {
    title:    `Copia de ${source.tripName}`,
    stops:    source.stops,
    transits: source.transits,
  };
  next();
}
