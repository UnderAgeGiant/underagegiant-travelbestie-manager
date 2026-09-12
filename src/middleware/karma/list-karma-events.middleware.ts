import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { IKarmaRepository } from '../../repositories/interfaces/karma.repository';
import { encodeKarmaEventsCursor } from '../../lib/karma-events-cursor';
import { KarmaEvent, KarmaEventTarget, KarmaPurchaseMeta } from '../../types';

const TRIP_LINKED_REASONS = new Set([
  'trip_created', 'itinerary_exported', 'collaborator_invite', 'trip_shared', 'ai_city_suggest',
]);
// ai_plan_refund only ever fires on a failed generation (never produces a trip),
// so it only ever needs the plain ai_plan_requests-existence check below.
const AI_PLAN_REQUEST_REASONS = new Set(['ai_plan', 'ai_plan_refund']);

// Belt-and-suspenders defense: ref_id is a plain TEXT column with no FK, so a
// non-UUID value (e.g. written before the tripId-uuid validation fix, or from
// any other non-UUID-guaranteed source) must never reach a query comparing it
// against a UUID column — pg would throw 'invalid input syntax for type uuid'
// and, since karma_events rows are immutable/never deleted, that would
// permanently 500 this user's entire ledger page. Silently exclude instead.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string): boolean => UUID_RE.test(v);

// SECURITY NOTE: the `AND owner_id = $2` / `AND user_id = $2` clauses in the five
// queries below are the actual cross-user isolation boundary for target/metadata
// resolution — karma.listEvents() already scopes the base ledger by userId, but a
// ref_id is just a TEXT column with no FK, so these lookups independently re-verify
// ownership rather than trusting that a ref_id could only ever belong to the caller.
// This can't be exercised by this file's mocked-pool tests (they return canned rows
// regardless of the SQL's WHERE clause) — verify these five ownership filters by
// reading the query text directly during code review, not by trusting a green test
// suite alone.

export function makeListKarmaEvents(karma: IKarmaRepository, pool: Pool) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { cursor, limit } = req.karmaEventsQuery!;
      const userId = req.user!.userId;

      const { rows, hasMore } = await karma.listEvents(userId, cursor, limit);

      const tripIds = [...new Set(rows.filter(r => TRIP_LINKED_REASONS.has(r.reason)).map(r => r.refId).filter(isUuid))];
      // Only 'ai_plan' (not 'ai_plan_refund') can ever have been saved into a trip.
      const aiPlanSourceCandidateIds = [...new Set(rows.filter(r => r.reason === 'ai_plan').map(r => r.refId).filter(isUuid))];
      const aiPlanRequestIds = [...new Set(rows.filter(r => AI_PLAN_REQUEST_REASONS.has(r.reason)).map(r => r.refId).filter(isUuid))];
      const purchaseIds = [...new Set(rows.filter(r => r.reason === 'karma_purchased').map(r => r.refId).filter(isUuid))];
      // ai_suggest -> resulting trip, resolved via the client-generated
      // planSessionId shared across a whole AI-planning session (session-level
      // analogue of the ai_plan -> trip link above, one level up).
      const aiSuggestSessionIds = [...new Set(rows.filter(r => r.reason === 'ai_suggest').map(r => r.refId).filter(isUuid))];

      const tripById = tripIds.length
        ? new Map((await pool.query(
            `SELECT trip_id, title FROM trips WHERE trip_id = ANY($1) AND owner_id = $2`,
            [tripIds, userId],
          )).rows.map((r: { trip_id: string; title: string }) => [r.trip_id, r.title]))
        : new Map<string, string>();

      // ai_plan -> resulting trip (+ its title): once saved, the ai_plan_requests
      // row is hard-deleted, so this is the only way that event can still resolve.
      const savedAiPlanTripByRequestId = aiPlanSourceCandidateIds.length
        ? new Map((await pool.query(
            `SELECT trip_id, title, source_ai_plan_request_id FROM trips WHERE source_ai_plan_request_id = ANY($1) AND owner_id = $2`,
            [aiPlanSourceCandidateIds, userId],
          )).rows.map((r: { trip_id: string; title: string; source_ai_plan_request_id: string }) =>
            [r.source_ai_plan_request_id, { tripId: r.trip_id, title: r.title }]))
        : new Map<string, { tripId: string; title: string }>();

      const existingAiPlanRequestIds = aiPlanRequestIds.length
        ? new Set((await pool.query(
            `SELECT request_id FROM ai_plan_requests WHERE request_id = ANY($1) AND user_id = $2 AND discarded_at IS NULL`,
            [aiPlanRequestIds, userId],
          )).rows.map((r: { request_id: string }) => r.request_id))
        : new Set<string>();

      const savedTripBySessionId = aiSuggestSessionIds.length
        ? new Map((await pool.query(
            `SELECT trip_id, title, source_plan_session_id FROM trips WHERE source_plan_session_id = ANY($1) AND owner_id = $2`,
            [aiSuggestSessionIds, userId],
          )).rows.map((r: { trip_id: string; title: string; source_plan_session_id: string }) =>
            [r.source_plan_session_id, { tripId: r.trip_id, title: r.title }]))
        : new Map<string, { tripId: string; title: string }>();

      const purchaseByRefId = purchaseIds.length
        ? new Map((await pool.query(
            `SELECT purchase_id, provider, provider_capture_id FROM karma_purchases WHERE purchase_id = ANY($1) AND user_id = $2`,
            [purchaseIds, userId],
          )).rows.map((r: { purchase_id: string; provider: string; provider_capture_id: string | null }) =>
            [r.purchase_id, { provider: r.provider, transactionId: r.provider_capture_id ?? r.purchase_id }]))
        : new Map<string, KarmaPurchaseMeta>();

      const events: KarmaEvent[] = rows.map(r => {
        let target: KarmaEventTarget | null = null;
        let purchase: KarmaPurchaseMeta | undefined;
        if (TRIP_LINKED_REASONS.has(r.reason) && tripById.has(r.refId)) {
          target = { type: 'trip', id: r.refId, name: tripById.get(r.refId)! };
        } else if (r.reason === 'ai_plan' && savedAiPlanTripByRequestId.has(r.refId)) {
          const link = savedAiPlanTripByRequestId.get(r.refId)!;
          target = { type: 'trip', id: link.tripId, name: link.title };
        } else if (AI_PLAN_REQUEST_REASONS.has(r.reason) && existingAiPlanRequestIds.has(r.refId)) {
          target = { type: 'ai_plan_request', id: r.refId };
        } else if (r.reason === 'ai_suggest' && savedTripBySessionId.has(r.refId)) {
          const link = savedTripBySessionId.get(r.refId)!;
          target = { type: 'trip', id: link.tripId, name: link.title };
        } else if (r.reason === 'karma_purchased' && purchaseByRefId.has(r.refId)) {
          purchase = purchaseByRefId.get(r.refId);
        }
        return { eventId: r.eventId, delta: r.delta, reason: r.reason, createdAt: r.createdAt, target, purchase };
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
