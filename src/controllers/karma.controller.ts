import { Request, Response, NextFunction, RequestHandler } from 'express';
import { IKarmaRepository } from '../repositories/interfaces/karma.repository';

const KARMA_COST_TRIP          = 1;
const KARMA_COST_SHARE         = 1;
const KARMA_COST_AI_PLAN       = 1;
const KARMA_COST_AI_SUGGEST    = 9;
const KARMA_COST_CITY_SUGGEST  = 2;

function insufficientKarmaError(have: number, need: number): Error & { status: number } {
  const err = new Error(`Insufficient karma: need ${need}, have ${have}`) as Error & { status: number };
  err.status = 402;
  return err;
}

export class KarmaController {
  constructor(private readonly karma: IKarmaRepository) {}

  get = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const record = await this.karma.get(req.user!.email);
      req.result = { karma: record.score };
      next();
    } catch (err) { next(err); }
  };

  requireKarma = (amount: number): RequestHandler => async (req, _res, next): Promise<void> => {
    try {
      const record = await this.karma.get(req.user!.email);
      if (record.score < amount) throw insufficientKarmaError(record.score, amount);
      next();
    } catch (err) { next(err); }
  };

  requireForTrip = this.requireKarma(KARMA_COST_TRIP);

  spend = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.karma.spend(req.user!.userId, req.trip!.id);
      next();
    } catch (err) { next(err); }
  };

  spendForAiSuggest = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.karma.spendAmount(req.user!.userId, KARMA_COST_AI_SUGGEST, 'ai_suggest', req.flowId);
      next();
    } catch (err) { next(err); }
  };

  spendForAiPlan = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.karma.spendAmount(req.user!.userId, KARMA_COST_AI_PLAN, 'ai_plan', req.flowId);
      next();
    } catch (err) { next(err); }
  };

  spendForCitySuggest = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.karma.spendAmount(req.user!.userId, KARMA_COST_CITY_SUGGEST, 'ai_city_suggest', req.flowId);
      next();
    } catch (err) { next(err); }
  };

  spendForShare = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.karma.spendAmount(req.user!.userId, KARMA_COST_SHARE, 'trip_shared', req.trip!.shareId!);
      next();
    } catch (err) { next(err); }
  };
}
