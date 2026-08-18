import { Request, Response, NextFunction, RequestHandler } from 'express';
import { IKarmaRepository } from '../repositories/interfaces/karma.repository';

const KARMA_COST_TRIP           = 1;
const KARMA_COST_AI_PLAN        = 1;
const KARMA_COST_AI_SUGGEST     = 9;
const KARMA_COST_CITY_SUGGEST   = 2;
const KARMA_COST_COMPANION_BOOST = 2;
const KARMA_COST_COLLABORATOR_INVITE = 1;

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

  spendFor = (
    amount: number,
    reason: string,
    getRefId: (req: Request) => string = req => req.flowId,
  ): RequestHandler => async (req, _res, next): Promise<void> => {
    try {
      await this.karma.spendAmount(req.user!.userId, amount, reason, getRefId(req));
      next();
    } catch (err) { next(err); }
  };

  spendForAiSuggest      = this.spendFor(KARMA_COST_AI_SUGGEST, 'ai_suggest');
  spendForAiPlan         = this.spendFor(KARMA_COST_AI_PLAN, 'ai_plan');
  spendForCitySuggest    = this.spendFor(KARMA_COST_CITY_SUGGEST, 'ai_city_suggest');
  spendForCompanionBoost = this.spendFor(KARMA_COST_COMPANION_BOOST, 'companion_boost');

  requireForCollaboratorInvite = this.requireKarma(KARMA_COST_COLLABORATOR_INVITE);

  spendForCollaboratorInvite = this.spendFor(
    KARMA_COST_COLLABORATOR_INVITE, 'collaborator_invite', req => req.trip!.id,
  );
}
