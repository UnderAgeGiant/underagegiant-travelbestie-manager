import { Request, Response, NextFunction } from 'express';
import { buildItinerary } from '../../lib/itinerary-generator';

export async function generateItinerary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { cityNames, attractionNames } = (req.body ?? {}) as {
      cityNames?: Record<string, string>;
      attractionNames?: Record<string, string>;
    };

    const buffer = await buildItinerary({ trip: req.trip!, cityNames, attractionNames });

    const safeName = req.trip!.title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
    const filename = `itinerario-${safeName}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  } catch (err) {
    next(err);
  }
}
