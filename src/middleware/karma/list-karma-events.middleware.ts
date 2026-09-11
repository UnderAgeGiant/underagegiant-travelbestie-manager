import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { IKarmaRepository } from '../../repositories/interfaces/karma.repository';
import { encodeKarmaEventsCursor } from '../../lib/karma-events-cursor';
import { KarmaEvent, KarmaEventTarget } from '../../types';

const TRIP_LINKED_REASONS = new Set([
  'trip_created', 'itinerary_exported', 'collaborator_invite', 'trip_shared', 'ai_city_suggest',
]);
// ai_plan_refund only ever fires on a failed generation (never produces a trip),
// so it only ever needs the plain ai_plan_requests-existence check below.
const AI_PLAN_REQUEST_REASONS = new Set(['ai_plan', 'ai_plan_refund']);

// SECURITY NOTE: the `AND owner_id = $2` / `AND user_id = $2` clauses in the three
// queries below are the actual cross-user isolation boundary for target resolution —
// karma.listEvents() already scopes the base ledger by userId, but a ref_id is just a
// TEXT column with no FK, so these existence checks independently re-verify ownership
// rather than trusting that a ref_id could only ever belong to the caller. This can't
// be exercised by this file's mocked-pool tests (they return canned rows regardless
// of the SQL's WHERE clause) — verify these three ownership filters by reading the
// query text directly during code review, not by trusting a green test suite alone.

export function makeListKarmaEvents(karma: IKarmaRepository, pool: Pool) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { cursor, limit } = req.karmaEventsQuery!;
      const userId = req.user!.userId;

      const { rows, hasMore } = await karma.listEvents(userId, cursor, limit);

      const tripIds = [...new Set(rows.filter(r => TRIP_LINKED_REASONS.has(r.reason)).map(r => r.refId))];
      // Only 'ai_plan' (not 'ai_plan_refund') can ever have been saved into a trip.
      const aiPlanSourceCandidateIds = [...new Set(rows.filter(r => r.reason === 'ai_plan').map(r => r.refId))];
      const aiPlanRequestIds = [...new Set(rows.filter(r => AI_PLAN_REQUEST_REASONS.has(r.reason)).map(r => r.refId))];

      const existingTripIds = tripIds.length
        ? new Set((await pool.query(
            `SELECT trip_id FROM trips WHERE trip_id = ANY($1) AND owner_id = $2`,
            [tripIds, userId],
          )).rows.map((r: { trip_id: string }) => r.trip_id))
        : new Set<string>();

      // ai_plan -> resulting trip: once a plan is saved, its ai_plan_requests row
      // is hard-deleted, so this is the only way that event can still resolve to
      // anything — without it, a saved plan's karma event would go dark forever.
      const savedAiPlanTripByRequestId = aiPlanSourceCandidateIds.length
        ? new Map((await pool.query(
            `SELECT trip_id, source_ai_plan_request_id FROM trips WHERE source_ai_plan_request_id = ANY($1) AND owner_id = $2`,
            [aiPlanSourceCandidateIds, userId],
          )).rows.map((r: { trip_id: string; source_ai_plan_request_id: string }) => [r.source_ai_plan_request_id, r.trip_id]))
        : new Map<string, string>();

      const existingAiPlanRequestIds = aiPlanRequestIds.length
        ? new Set((await pool.query(
            `SELECT request_id FROM ai_plan_requests WHERE request_id = ANY($1) AND user_id = $2 AND discarded_at IS NULL`,
            [aiPlanRequestIds, userId],
          )).rows.map((r: { request_id: string }) => r.request_id))
        : new Set<string>();

      const events: KarmaEvent[] = rows.map(r => {
        let target: KarmaEventTarget | null = null;
        if (TRIP_LINKED_REASONS.has(r.reason) && existingTripIds.has(r.refId)) {
          target = { type: 'trip', id: r.refId };
        } else if (r.reason === 'ai_plan' && savedAiPlanTripByRequestId.has(r.refId)) {
          target = { type: 'trip', id: savedAiPlanTripByRequestId.get(r.refId)! };
        } else if (AI_PLAN_REQUEST_REASONS.has(r.reason) && existingAiPlanRequestIds.has(r.refId)) {
          target = { type: 'ai_plan_request', id: r.refId };
        }
        return { eventId: r.eventId, delta: r.delta, reason: r.reason, createdAt: r.createdAt, target };
      });

      const last = rows[rows.length - 1];
      const nextCursor = hasMore && last
        ? encodeKarmaEventsCursor({ createdAt: last.createdAt, eventId: last.eventId })
        : null;

      req.result = { events, nextCursor };
      next();
    } catch (err) { next(err); }
  };
}
