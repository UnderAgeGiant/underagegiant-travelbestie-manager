import { Request, Response, NextFunction } from 'express';

export function injectCommentAuthor(req: Request, _res: Response, next: NextFunction): void {
  req.body.name = req.user!.name;
  next();
}
