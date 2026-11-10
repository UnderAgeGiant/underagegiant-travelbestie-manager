import { Request, Response, NextFunction } from 'express';
import { buildItinerary } from '../../lib/itinerary-generator';
import { logEvent } from '../../lib/log-event';
import type { ItineraryExportBody } from '../../schemas/itinerary.schemas';

export async function generateItinerary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // req.body was validated (and unknown keys stripped) by validateBody(itineraryExportSchema).
    const { locale, cityNames, attractionNames, ticketRequiredIds, attractionDurations, ...details } = req.body as ItineraryExportBody;

    const firstExport = !req.trip!.itineraryExportedAt;
    const buffer = await buildItinerary({
      trip: req.trip!, locale, cityNames, attractionNames, ticketRequiredIds, attractionDurations,
      details, context: req.itineraryContext,
    });

    const safeName = req.trip!.title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
    const filename = `itinerario-${safeName}.xlsx`;

    logEvent(req, 'cta_itinerary_export', { tripId: req.trip!.id, firstExport });

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  } catch (err) {
    next(err);
  }
}
