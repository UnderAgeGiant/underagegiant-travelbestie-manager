import { Request, Response, NextFunction } from 'express';

export function buildTripResponse(req: Request, _res: Response, next: NextFunction): void {
  const t = req.trip!;
  req.result = { id: t.id, title: t.title, stops: t.stops, transits: t.transits, ownerId: t.ownerId, createdAt: t.createdAt };
  next();
}
