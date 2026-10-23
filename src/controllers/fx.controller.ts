import { Request, Response, NextFunction } from 'express';
import { getUsdRates } from '../lib/fx';

export class FxController {
  rates = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    req.result = await getUsdRates();
    next();
  };
}
