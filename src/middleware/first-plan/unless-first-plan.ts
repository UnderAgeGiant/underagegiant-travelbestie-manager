import { RequestHandler } from 'express';

/** Runs `fn` only when this request did NOT claim the free first plan (the paid path). */
export function unlessFirstPlan(fn: RequestHandler): RequestHandler {
  return (req, res, next) => req.firstPlanClaimed ? next() : fn(req, res, next);
}

/** Runs `fn` only when this request claimed the free first plan. */
export function whenFirstPlan(fn: RequestHandler): RequestHandler {
  return (req, res, next) => req.firstPlanClaimed ? fn(req, res, next) : next();
}
