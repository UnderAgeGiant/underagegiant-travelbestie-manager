import { Pool, PoolClient } from 'pg';
import { ITripRepository } from '../interfaces/trip.repository';
import { Trip, TripStop, TransitLeg, PlannedAttraction, TransitSegment, SharedTripPayload, AttractionCategory, Lodging, FeedPage, FeedPlan, SeoSharedRow, SeoSitemapRow } from '../../types';
import { FeedCursor, encodeFeedCursor } from '../../lib/feed-cursor';

// dd/mm/yyyy → yyyy-mm-dd
function toISO(dmy: string): string {
  const [d, m, y] = dmy.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// pg DATE (string 'yyyy-mm-dd' or Date) → dd/mm/yyyy
function toDMY(pgDate: Date | string): string {
  const s = pgDate instanceof Date
    ? pgDate.toISOString().slice(0, 10)
    : String(pgDate).slice(0, 10);
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

// pg TIME 'HH:mm:ss' → 'HH:mm'
function toHM(pgTime: string): string {
  return String(pgTime).slice(0, 5);
}

export class PgTripRepository implements ITripRepository {
  constructor(private readonly pool: Pool) {}

  async create(data: {
    title: string; stops: TripStop[]; transits: TransitLeg[]; ownerId: string;
    sourceAiPlanRequestId?: string; sourcePlanSessionId?: string;
  }): Promise<Trip> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [row] } = await client.query(
        `INSERT INTO trips (owner_id, title, source_ai_plan_request_id, source_plan_session_id) VALUES ($1, $2, $3, $4) RETURNING trip_id, created_at`,
        [data.ownerId, data.title, data.sourceAiPlanRequestId ?? null, data.sourcePlanSessionId ?? null],
      );
      await insertStops(client, row.trip_id, data.stops);
      await insertLegs(client, row.trip_id, data.transits);
      await client.query('COMMIT');
      return {
        id: row.trip_id as string,
        title: data.title,
        stops: data.stops,
        transits: data.transits,
        ownerId: data.ownerId,
        createdAt: (row.created_at as Date).toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async findByOwner(ownerId: string): Promise<Trip[]> {
    const { rows } = await this.pool.query(
      `SELECT trip_id, title, owner_id, created_at, share_id, itinerary_exported_at FROM trips WHERE owner_id = $1 ORDER BY created_at DESC`,
      [ownerId],
    );
    return hydrateTrips(this.pool, rows);
  }

  async findById(id: string): Promise<Trip | null> {
    const { rows: [row] } = await this.pool.query(
      `SELECT trip_id, title, owner_id, created_at, share_id, itinerary_exported_at FROM trips WHERE trip_id = $1`,
      [id],
    );
    return row ? hydrateTrip(this.pool, row) : null;
  }

  async setExportedAt(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE trips SET itinerary_exported_at = now(), updated_at = now() WHERE trip_id = $1`,
      [id],
    );
  }

  async setShareId(id: string, shareId: string): Promise<Trip | null> {
    const { rowCount } = await this.pool.query(
      `UPDATE trips SET share_id = $1, updated_at = now() WHERE trip_id = $2`,
      [shareId, id],
    );
    if ((rowCount ?? 0) === 0) return null;
    return this.findById(id);
  }

  async findByShareId(shareId: string): Promise<SharedTripPayload | null> {
    const { rows: [row] } = await this.pool.query(
      `SELECT t.trip_id, t.title, t.owner_id, t.created_at, t.share_id,
              u.email AS owner_email, u.name AS owner_name
       FROM trips t
       JOIN users u ON t.owner_id = u.user_id
       WHERE t.share_id = $1`,
      [shareId],
    );
    if (!row) return null;
    const trip = await hydrateTrip(this.pool, row);
    return {
      id:         shareId,
      tripName:   trip.title,
      ownerId:    row.owner_id as string,
      ownerEmail: row.owner_email as string,
      ownerName:  row.owner_name as string,
      createdAt:  trip.createdAt,
      stops:      trip.stops,
      transits:   trip.transits,
      planId:     trip.id,
      tripId:     trip.id,
    };
  }

  async findManyByShareIds(shareIds: string[]): Promise<SharedTripPayload[]> {
    if (shareIds.length === 0) return [];
    const { rows } = await this.pool.query(
      `SELECT t.trip_id, t.title, t.owner_id, t.created_at, t.share_id,
              u.email AS owner_email, u.name AS owner_name
       FROM trips t
       JOIN users u ON t.owner_id = u.user_id
       WHERE t.share_id = ANY($1::text[])`,
      [shareIds],
    );
    const trips = await hydrateTrips(this.pool, rows);

    const byShareId = new Map<string, SharedTripPayload>();
    trips.forEach((trip, i) => {
      const row = rows[i];
      byShareId.set(row.share_id as string, {
        id:         row.share_id    as string,
        tripName:   trip.title,
        ownerEmail: row.owner_email as string,
        ownerName:  row.owner_name  as string,
        createdAt:  trip.createdAt,
        stops:      trip.stops,
        transits:   trip.transits,
        planId:     trip.id,
        tripId:     trip.id,
      });
    });
    return shareIds.flatMap(id => {
      const p = byShareId.get(id);
      return p ? [p] : [];
    });
  }

  async searchShared(query: string): Promise<SharedTripPayload[]> {
    const q = query.trim();
    if (!q) return [];
    const { rows } = await this.pool.query(
      `SELECT t.trip_id, t.title, t.owner_id, t.created_at, t.share_id,
              u.email AS owner_email, u.name AS owner_name,
              (SELECT COUNT(*) FROM trip_favorites f WHERE f.trip_id = t.trip_id)::int AS favorite_count
       FROM trips t
       JOIN users u ON t.owner_id = u.user_id
       WHERE t.share_id IS NOT NULL
         AND (t.title ILIKE $1 OR u.name ILIKE $1)
       ORDER BY t.created_at DESC
       LIMIT 5`,
      [`%${q}%`],
    );
    const trips = await hydrateTrips(this.pool, rows);
    return trips.map((trip, i) => ({
      id:            rows[i].share_id    as string,
      tripName:      trip.title,
      ownerEmail:    rows[i].owner_email as string,
      ownerName:     rows[i].owner_name  as string,
      createdAt:     trip.createdAt,
      stops:         trip.stops,
      transits:      trip.transits,
      planId:        trip.id,
      tripId:        trip.id,
      favoriteCount: rows[i].favorite_count as number,
    }));
  }

  /** Public feed page: shared plans with >=1 stop, ranked by favorites. Keyset-paginated on
   *  (favorite_count, created_at, trip_id) — all DESC, so the row-value comparison is valid.
   *  Deliberately never selects owner_id/owner_email. */
  async listFeed(cursor: FeedCursor | null, limit: number): Promise<FeedPage> {
    const { rows } = await this.pool.query(
      `WITH ranked AS (
         SELECT t.trip_id, t.title, t.created_at, t.created_at::text AS created_at_raw,
                t.share_id, u.name AS owner_name,
                COALESCE(f.c, 0)::int AS favorite_count
         FROM trips t
         JOIN users u ON u.user_id = t.owner_id
         LEFT JOIN (SELECT trip_id, COUNT(*) AS c FROM trip_favorites GROUP BY trip_id) f
                ON f.trip_id = t.trip_id
         WHERE t.share_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM trip_stops s WHERE s.trip_id = t.trip_id)
       )
       SELECT * FROM ranked
       WHERE $1::int IS NULL
          OR (favorite_count, created_at, trip_id) < ($1::int, $2::timestamptz, $3::uuid)
       ORDER BY favorite_count DESC, created_at DESC, trip_id DESC
       LIMIT $4`,
      [cursor?.favoriteCount ?? null, cursor?.createdAt ?? null, cursor?.tripId ?? null, limit + 1],
    );

    const hasMore  = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const trips    = await hydrateTrips(this.pool, pageRows);

    const items: FeedPlan[] = trips.map((trip, i) => ({
      id:            pageRows[i].share_id as string,
      tripName:      trip.title,
      ownerName:     pageRows[i].owner_name as string,
      createdAt:     trip.createdAt,
      favoriteCount: pageRows[i].favorite_count as number,
      stops: trip.stops.map(s => ({
        cityId: s.cityId, checkIn: s.checkIn, checkOut: s.checkOut,
        selectedAttractions: s.selectedAttractions.map(a => ({
          attractionId: a.attractionId,
          ...(a.date ? { date: a.date } : {}),
          startTime: a.startTime,
          endTime:   a.endTime,
        })),
      })),
    }));

    const last = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && last
      ? encodeFeedCursor({
          favoriteCount: last.favorite_count as number,
          createdAt:     last.created_at_raw as string,
          tripId:        last.trip_id as string,
        })
      : null;

    return { items, nextCursor };
  }

  /** SEO summary source row for one shared trip. PII-free by construction: no owner columns, no users join. */
  async findSeoRow(shareId: string): Promise<SeoSharedRow | null> {
    const { rows: [r] } = await this.pool.query(
      `SELECT t.share_id AS id, t.title, t.updated_at,
              COALESCE((SELECT array_agg(s.city_id ORDER BY s.sort_order)
                          FROM trip_stops s WHERE s.trip_id = t.trip_id), '{}') AS city_ids,
              (SELECT COUNT(*)::int FROM planned_attractions pa
                 JOIN trip_stops s ON s.stop_id = pa.stop_id
                WHERE s.trip_id = t.trip_id) AS attraction_count
         FROM trips t
        WHERE t.share_id = $1`,
      [shareId],
    );
    if (!r) return null;
    return {
      id: r.id as string,
      tripName: r.title as string,
      cityIds: r.city_ids as string[],
      attractionCount: r.attraction_count as number,
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }

  /** Shared trips with at least `minAttractions` planned attractions, most recently updated first (sitemap source).
   *  Rows carry cityIds so the controller can also apply the known-city rule; they never leave the API. */
  async listSeoIndex(minAttractions: number, limit: number): Promise<SeoSitemapRow[]> {
    const { rows } = await this.pool.query(
      `SELECT t.share_id AS id, t.updated_at,
              COALESCE((SELECT array_agg(s.city_id ORDER BY s.sort_order)
                          FROM trip_stops s WHERE s.trip_id = t.trip_id), '{}') AS city_ids
         FROM trips t
        WHERE t.share_id IS NOT NULL
          AND (SELECT COUNT(*) FROM planned_attractions pa
                 JOIN trip_stops s ON s.stop_id = pa.stop_id
                WHERE s.trip_id = t.trip_id) >= $1
        ORDER BY t.updated_at DESC, t.trip_id DESC
        LIMIT $2`,
      [minAttractions, limit],
    );
    return rows.map(r => ({
      id: r.id as string,
      updatedAt: new Date(r.updated_at).toISOString(),
      cityIds: r.city_ids as string[],
    }));
  }

  async update(id: string, data: Partial<Pick<Trip, 'title' | 'stops' | 'transits'>>): Promise<Trip | null> {
    const { rows: [existing] } = await this.pool.query(
      `SELECT trip_id FROM trips WHERE trip_id = $1`,
      [id],
    );
    if (!existing) return null;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Always bump updated_at — a stops/transits-only edit is still an edit, and the SEO
      // sitemap's <lastmod> is derived from this column.
      await client.query(
        `UPDATE trips SET title = COALESCE($1, title), updated_at = now() WHERE trip_id = $2`,
        [data.title ?? null, id],
      );
      if (data.stops !== undefined) {
        await client.query(`DELETE FROM trip_stops WHERE trip_id = $1`, [id]);
        await insertStops(client, id, data.stops);
      }
      if (data.transits !== undefined) {
        await client.query(`DELETE FROM transit_legs WHERE trip_id = $1`, [id]);
        await insertLegs(client, id, data.transits);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM trips WHERE trip_id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }
}

async function insertStops(client: PoolClient, tripId: string, stops: TripStop[]): Promise<void> {
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const { rows: [row] } = await client.query(
      `INSERT INTO trip_stops (trip_id, city_id, check_in, check_out, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING stop_id`,
      [tripId, s.cityId, toISO(s.checkIn), toISO(s.checkOut), i],
    );
    if (s.lodging) {
      await client.query(
        `INSERT INTO stop_lodgings (stop_id, name, url, address, notes) VALUES ($1, $2, $3, $4, $5)`,
        [row.stop_id, s.lodging.name, s.lodging.url ?? '', s.lodging.address ?? null, s.lodging.notes ?? null],
      );
    }
    for (let j = 0; j < s.selectedAttractions.length; j++) {
      const a = s.selectedAttractions[j];
      await client.query(
        `INSERT INTO planned_attractions (stop_id, attraction_id, start_time, end_time, date, category, ticket_purchased, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [row.stop_id, a.attractionId, a.startTime ?? null, a.endTime ?? null,
         a.date ? toISO(a.date) : null, a.category ?? null, a.ticketPurchased ?? false, j],
      );
    }
  }
}

async function insertLegs(client: PoolClient, tripId: string, legs: TransitLeg[]): Promise<void> {
  for (let i = 0; i < legs.length; i++) {
    const l = legs[i];
    const { rows: [row] } = await client.query(
      `INSERT INTO transit_legs (trip_id, from_city_id, to_city_id, date, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING leg_id`,
      [tripId, l.fromCityId, l.toCityId, l.date ? toISO(l.date) : null, i],
    );
    for (let j = 0; j < l.segments.length; j++) {
      const seg = l.segments[j];
      await client.query(
        `INSERT INTO transit_segments
           (leg_id, mode, departure_date, departure_time, arrival_date, arrival_time, notes, duration_minutes, carrier, location_url, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [row.leg_id, seg.mode, toISO(seg.departureDate), seg.departureTime,
          toISO(seg.arrivalDate), seg.arrivalTime, seg.notes, seg.durationMinutes ?? null,
          seg.carrier ?? null, seg.locationUrl ?? null, j],
      );
    }
  }
}

async function hydrateTrip(pool: Pool, row: Record<string, unknown>): Promise<Trip> {
  const tripId = row.trip_id as string;

  const { rows: stopRows } = await pool.query(
    `SELECT stop_id, city_id, check_in, check_out FROM trip_stops WHERE trip_id = $1 ORDER BY sort_order`,
    [tripId],
  );
  const stopIds: string[] = stopRows.map(s => s.stop_id as string);

  const lodgingMap = new Map<string, Lodging>();
  const attrMap = new Map<string, PlannedAttraction[]>();

  if (stopIds.length > 0) {
    const { rows: lodgingRows } = await pool.query(
      `SELECT stop_id, name, url, address, notes FROM stop_lodgings WHERE stop_id = ANY($1)`,
      [stopIds],
    );
    for (const l of lodgingRows) {
      lodgingMap.set(l.stop_id as string, {
        name: l.name as string,
        url: l.url as string,
        ...(l.address ? { address: l.address as string } : {}),
        ...(l.notes   ? { notes:   l.notes   as string } : {}),
      });
    }

    const { rows: attrRows } = await pool.query(
      `SELECT stop_id, attraction_id, start_time, end_time, date, category, ticket_purchased FROM planned_attractions
       WHERE stop_id = ANY($1) ORDER BY stop_id, sort_order`,
      [stopIds],
    );
    for (const a of attrRows) {
      const list = attrMap.get(a.stop_id as string) ?? [];
      list.push({
        attractionId: a.attraction_id as string,
        startTime: a.start_time ? toHM(a.start_time as string) : null,
        endTime:   a.end_time   ? toHM(a.end_time   as string) : null,
        ...(a.date     ? { date:     toDMY(a.date as string) } : {}),
        ...(a.category ? { category: a.category as AttractionCategory } : {}),
        ...(a.ticket_purchased ? { ticketPurchased: true } : {}),
      });
      attrMap.set(a.stop_id as string, list);
    }
  }

  const stops: TripStop[] = stopRows.map(s => ({
    cityId: s.city_id as string,
    checkIn: toDMY(s.check_in as string),
    checkOut: toDMY(s.check_out as string),
    lodging: lodgingMap.get(s.stop_id as string),
    selectedAttractions: attrMap.get(s.stop_id as string) ?? [],
  }));

  const { rows: legRows } = await pool.query(
    `SELECT leg_id, from_city_id, to_city_id, date FROM transit_legs WHERE trip_id = $1 ORDER BY sort_order`,
    [tripId],
  );
  const legIds: string[] = legRows.map(l => l.leg_id as string);

  const segMap = new Map<string, TransitSegment[]>();
  if (legIds.length > 0) {
    const { rows: segRows } = await pool.query(
      `SELECT leg_id, mode, departure_date, departure_time, arrival_date, arrival_time, notes, duration_minutes, carrier, location_url
       FROM transit_segments WHERE leg_id = ANY($1) ORDER BY leg_id, sort_order`,
      [legIds],
    );
    for (const s of segRows) {
      const list = segMap.get(s.leg_id as string) ?? [];
      list.push({
        mode: s.mode as TransitSegment['mode'],
        departureDate: toDMY(s.departure_date as string),
        departureTime: toHM(s.departure_time as string),
        arrivalDate: toDMY(s.arrival_date as string),
        arrivalTime: toHM(s.arrival_time as string),
        notes: s.notes as string,
        ...(s.duration_minutes != null ? { durationMinutes: s.duration_minutes as number } : {}),
        ...(s.carrier      ? { carrier:     s.carrier      as string } : {}),
        ...(s.location_url ? { locationUrl: s.location_url as string } : {}),
      });
      segMap.set(s.leg_id as string, list);
    }
  }

  const transits: TransitLeg[] = legRows.map(l => ({
    fromCityId: l.from_city_id as string,
    toCityId: l.to_city_id as string,
    ...(l.date ? { date: toDMY(l.date as string) } : {}),
    segments: segMap.get(l.leg_id as string) ?? [],
  }));

  return {
    id: tripId,
    title: row.title as string,
    stops,
    transits,
    ownerId: row.owner_id as string,
    createdAt: (row.created_at as Date).toISOString(),
    ...(row.share_id ? { shareId: row.share_id as string } : {}),
    ...(row.itinerary_exported_at ? { itineraryExportedAt: (row.itinerary_exported_at as Date).toISOString() } : {}),
  };
}

async function hydrateTrips(pool: Pool, rows: Record<string, unknown>[]): Promise<Trip[]> {
  if (rows.length === 0) return [];

  const tripIds = rows.map(r => r.trip_id as string);

  const [{ rows: stopRows }, { rows: legRows }] = await Promise.all([
    pool.query(
      `SELECT stop_id, trip_id, city_id, check_in, check_out
       FROM trip_stops WHERE trip_id = ANY($1::uuid[]) ORDER BY trip_id, sort_order`,
      [tripIds],
    ),
    pool.query(
      `SELECT leg_id, trip_id, from_city_id, to_city_id, date
       FROM transit_legs WHERE trip_id = ANY($1::uuid[]) ORDER BY trip_id, sort_order`,
      [tripIds],
    ),
  ]);

  const stopIds = stopRows.map(s => s.stop_id as string);
  const legIds  = legRows.map(l => l.leg_id as string);

  const lodgingMap = new Map<string, Lodging>();
  const attrMap    = new Map<string, PlannedAttraction[]>();
  const segMap     = new Map<string, TransitSegment[]>();

  const [lodgingRows, attrRows, segRows] = await Promise.all([
    stopIds.length > 0
      ? pool.query(`SELECT stop_id, name, url, address, notes FROM stop_lodgings WHERE stop_id = ANY($1::uuid[])`, [stopIds]).then(r => r.rows)
      : Promise.resolve([] as Record<string, unknown>[]),
    stopIds.length > 0
      ? pool.query(
          `SELECT stop_id, attraction_id, start_time, end_time, date, category, ticket_purchased
           FROM planned_attractions WHERE stop_id = ANY($1::uuid[]) ORDER BY stop_id, sort_order`,
          [stopIds],
        ).then(r => r.rows)
      : Promise.resolve([] as Record<string, unknown>[]),
    legIds.length > 0
      ? pool.query(
          `SELECT leg_id, mode, departure_date, departure_time, arrival_date, arrival_time, notes, duration_minutes, carrier, location_url
           FROM transit_segments WHERE leg_id = ANY($1::uuid[]) ORDER BY leg_id, sort_order`,
          [legIds],
        ).then(r => r.rows)
      : Promise.resolve([] as Record<string, unknown>[]),
  ]);

  for (const l of lodgingRows) {
    lodgingMap.set(l.stop_id as string, {
      name: l.name as string,
      url: l.url as string,
      ...(l.address ? { address: l.address as string } : {}),
      ...(l.notes   ? { notes:   l.notes   as string } : {}),
    });
  }
  for (const a of attrRows) {
    const list = attrMap.get(a.stop_id as string) ?? [];
    list.push({
      attractionId: a.attraction_id as string,
      startTime: a.start_time ? toHM(a.start_time as string) : null,
      endTime:   a.end_time   ? toHM(a.end_time   as string) : null,
      ...(a.date     ? { date:     toDMY(a.date as string) }             : {}),
      ...(a.category ? { category: a.category as AttractionCategory }    : {}),
      ...(a.ticket_purchased ? { ticketPurchased: true } : {}),
    });
    attrMap.set(a.stop_id as string, list);
  }
  for (const s of segRows) {
    const list = segMap.get(s.leg_id as string) ?? [];
    list.push({
      mode: s.mode as TransitSegment['mode'],
      departureDate: toDMY(s.departure_date as string),
      departureTime: toHM(s.departure_time  as string),
      arrivalDate:   toDMY(s.arrival_date   as string),
      arrivalTime:   toHM(s.arrival_time    as string),
      notes: s.notes as string,
      ...(s.duration_minutes != null ? { durationMinutes: s.duration_minutes as number } : {}),
      ...(s.carrier      ? { carrier:     s.carrier      as string } : {}),
      ...(s.location_url ? { locationUrl: s.location_url as string } : {}),
    });
    segMap.set(s.leg_id as string, list);
  }

  const stopsByTrip = new Map<string, Record<string, unknown>[]>();
  for (const s of stopRows) {
    const list = stopsByTrip.get(s.trip_id as string) ?? [];
    list.push(s);
    stopsByTrip.set(s.trip_id as string, list);
  }

  const legsByTrip = new Map<string, Record<string, unknown>[]>();
  for (const l of legRows) {
    const list = legsByTrip.get(l.trip_id as string) ?? [];
    list.push(l);
    legsByTrip.set(l.trip_id as string, list);
  }

  return rows.map(row => {
    const tripId = row.trip_id as string;

    const stops: TripStop[] = (stopsByTrip.get(tripId) ?? []).map(s => ({
      cityId:   s.city_id  as string,
      checkIn:  toDMY(s.check_in  as string),
      checkOut: toDMY(s.check_out as string),
      lodging:  lodgingMap.get(s.stop_id as string),
      selectedAttractions: attrMap.get(s.stop_id as string) ?? [],
    }));

    const transits: TransitLeg[] = (legsByTrip.get(tripId) ?? []).map(l => ({
      fromCityId: l.from_city_id as string,
      toCityId:   l.to_city_id   as string,
      ...(l.date ? { date: toDMY(l.date as string) } : {}),
      segments: segMap.get(l.leg_id as string) ?? [],
    }));

    return {
      id:        tripId,
      title:     row.title    as string,
      stops,
      transits,
      ownerId:   row.owner_id as string,
      createdAt: (row.created_at as Date).toISOString(),
      ...(row.share_id              ? { shareId:             row.share_id              as string }              : {}),
      ...(row.itinerary_exported_at ? { itineraryExportedAt: (row.itinerary_exported_at as Date).toISOString() } : {}),
    };
  });
}
