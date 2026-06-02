import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';

export function makeResolveSharedTrip(pool: Pool) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { rows: [row] } = await pool.query(
      `SELECT trip_id, owner_id FROM trips WHERE share_id = $1`,
      [req.params.shareId],
    );
    if (!row) {
      res.status(404).json({ error: 'Shared trip not found' });
      return;
    }
    req.sharedTripMeta = { tripId: row.trip_id as string, ownerId: row.owner_id as string };
    next();
  };
}
