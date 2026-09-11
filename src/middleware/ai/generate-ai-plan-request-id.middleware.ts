import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/** Generates the ai_plan_requests row's id up front, before karma is charged,
 *  so chargeAiPlanIfNeeded and kickoffAiPlan share one id — fixes the ai_plan
 *  karma event's ref_id, which previously defaulted to the ephemeral
 *  req.flowId (never persisted anywhere after the request finished). */
export function generateAiPlanRequestId(req: Request, _res: Response, next: NextFunction): void {
  req.aiPlanRequestId = randomUUID();
  next();
}
