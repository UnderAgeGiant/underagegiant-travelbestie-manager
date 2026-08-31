import { Request, Response, NextFunction } from 'express';
import { respondError } from '../../lib/respond-error';
import { CITY_COORDS } from '../../data/city-coords';
import { dmyToISO, iterateISODates, isValidDMY } from '../../lib/weather-dates';

const DMY_RE = /^\d{2}\/\d{2}\/\d{4}$/;
const MAX_RANGE_DAYS = 31;

export function validateWeatherQuery(req: Request, res: Response, next: NextFunction): void {
  const cityId  = req.query.cityId;
  const checkIn = req.query.checkIn;
  const checkOut = req.query.checkOut;

  if (typeof cityId !== 'string' || !cityId) {
    respondError(req, res, 400, { error: 'cityId is required' }); return;
  }
  if (!CITY_COORDS[cityId]) {
    respondError(req, res, 400, { error: `Unknown cityId: ${cityId}` }); return;
  }
  if (typeof checkIn !== 'string' || !DMY_RE.test(checkIn) ||
      typeof checkOut !== 'string' || !DMY_RE.test(checkOut)) {
    respondError(req, res, 400, { error: 'checkIn/checkOut must be dd/mm/yyyy' }); return;
  }
  // Shape-valid (dd/mm/yyyy) is not enough — reject a non-existent calendar date
  // like 31/02/2026 here, before it can reach dmyToISO/addDaysISO's silent
  // rollover and come back as real weather data mislabeled with a fake date.
  if (!isValidDMY(checkIn) || !isValidDMY(checkOut)) {
    respondError(req, res, 400, { error: 'checkIn/checkOut must be a valid calendar date' }); return;
  }

  const checkInISO  = dmyToISO(checkIn);
  const checkOutISO = dmyToISO(checkOut);
  if (checkInISO > checkOutISO) {
    respondError(req, res, 400, { error: 'checkIn must not be after checkOut' }); return;
  }

  const isoDates = iterateISODates(checkInISO, checkOutISO);
  if (isoDates.length > MAX_RANGE_DAYS) {
    respondError(req, res, 400, { error: `Range must be at most ${MAX_RANGE_DAYS} days` }); return;
  }

  req.weatherQuery = { cityId, checkIn, checkOut, isoDates };
  next();
}
