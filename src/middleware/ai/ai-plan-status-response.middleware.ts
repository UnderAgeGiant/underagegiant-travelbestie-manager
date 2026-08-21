import { Request, Response, NextFunction } from 'express';

/** Shapes GET /ai/plan/:requestId/status's response from req.aiPlanRequest. */
export function aiPlanStatusResponse(req: Request, _res: Response, next: NextFunction): void {
  const record = req.aiPlanRequest!;
  req.result = {
    status:     record.status,
    result:     record.result,
    changeInfo: record.changeInfo,
    error:      record.errorMessage,
  };
  next();
}
