import { Request, Response, NextFunction } from 'express';

export function respond(status: number) {
  return (req: Request, res: Response, _next: NextFunction): void => {
    if (status === 204) { res.status(204).send(); return; }
    res.status(status).json(req.result);
  };
}
