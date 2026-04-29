import { Request, Response, NextFunction } from 'express';

export function validateRating(req: Request, res: Response, next: NextFunction): void {
  const rating = req.body.rating as number;
  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'rating must be a number between 1 and 5' }); return;
  }
  next();
}
