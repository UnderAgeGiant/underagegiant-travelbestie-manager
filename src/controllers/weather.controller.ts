import { Request, Response, NextFunction } from 'express';
import { getWeatherDays } from '../lib/weather-days';

export class WeatherController {
  get = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const { cityId, isoDates } = req.weatherQuery!;
    req.result = { days: await getWeatherDays(cityId, isoDates) };
    next();
  };
}
