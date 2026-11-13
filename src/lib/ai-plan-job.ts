import { AiController } from '../controllers/ai.controller';
import { IAiPlanRequestRepository } from '../repositories/interfaces/ai-plan-request.repository';
import { IKarmaRepository } from '../repositories/interfaces/karma.repository';
import { INotificationRepository } from '../repositories/interfaces/notification.repository';
import { IUserRepository } from '../repositories/interfaces/user.repository';
import { ITripRepository } from '../repositories/interfaces/trip.repository';
import { AiPlanBody } from '../schemas/ai.schemas';
import { PlanChangeResult } from '../types';
import { buildPlanChangeInfo, toSessionOptions } from './plan-change-detector';
import { writePlanSession } from './plan-session-store';
import { logger } from './logger';
import { capture } from './analytics';
import { TrophyRecorder } from './trophy-recorder';
import { restrictPlanToCities } from './ai-output';

export interface AiPlanJobDeps {
  ai:            AiController;
  aiPlanRequests: IAiPlanRequestRepository;
  karma:         IKarmaRepository;
  notifications: INotificationRepository;
  trophies?:     TrophyRecorder;
  users?:        IUserRepository;   // F79 first run only (release the gift on failure)
  trips?:        ITripRepository;   // F79 first run only (the job saves the trip)
}

export interface AiPlanJobParams {
  requestId:        string;
  userId:           string;
  flowId:            string;
  body:             AiPlanBody;
  planChangeResult: PlanChangeResult;
  karmaCharged:     number;
  /** F79 POST /ai/first-plan: save the trip server-side, keep only these cities, return the gift on failure. */
  firstPlan?:       { cityIds: string[] };
}

/**
 * Runs entirely after POST /ai/plan's 202 response has already been sent —
 * scheduled via waitUntil() in kickoff-ai-plan.middleware.ts. The actual
 * DeepSeek call, the Redis free-change session update, the ai_plan_requests
 * DB write, and the completion/failure notification (with karma refund on
 * failure) all happen here. Never throws — every failure path is caught and
 * turned into a 'failed' row + notification instead of an unhandled rejection.
 */
export async function runAiPlanJob(deps: AiPlanJobDeps, params: AiPlanJobParams): Promise<void> {
  const { requestId, userId, flowId, body, planChangeResult, karmaCharged, firstPlan } = params;
  const firstPlanSaved: { tripId?: string } = {};

  try {
    if (firstPlan) {
      await completeFirstPlan(deps, params, firstPlan.cityIds, firstPlanSaved);
      return;
    }

    const result = await deps.ai.generatePlan(body, userId);

    if (body.planSessionId) {
      await writePlanSession(userId, body.planSessionId, planChangeResult, toSessionOptions(body));
    }

    const changeInfo = buildPlanChangeInfo(planChangeResult);
    await deps.aiPlanRequests.markCompleted(requestId, result, changeInfo);

    // Only paid plans count toward the AI trophy (free re-plans could be farmed). record() never throws.
    if (karmaCharged > 0 && deps.trophies) await deps.trophies.record(userId, 'ai_plans', requestId);

    logger.info({ event: 'cta_ai_plan', flowId, userId, changeType: planChangeResult.type, requestId });
    capture(userId, 'cta_ai_plan', { changeType: planChangeResult.type, requestId });

    await deps.notifications.add({
      userId,
      type:  'ai_plan_ready',
      title: '🐾 Tu plan está listo',
      body:  `Tu plan "${result.title}" ya está listo. Revísalo en Planes IA Pendientes.`,
      url:   `/my-trips?tab=aiplans&focus=${encodeURIComponent(requestId)}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error generating plan';
    logger.error({ msg: 'AI plan generation failed', requestId, userId, flowId, err: message });

    // F79: a failed first run gives the gift back — unless its trip was already saved.
    if (firstPlan && !firstPlanSaved.tripId) {
      try {
        await deps.users!.releaseFirstPlan(userId);
      } catch (releaseErr) {
        logger.error({ msg: 'Failed to release the first-plan gift after a failed first run', requestId, userId, err: releaseErr });
      }
    }

    try {
      await deps.aiPlanRequests.markFailed(requestId, message);
    } catch (dbErr) {
      logger.error({ msg: 'Failed to mark ai_plan_requests as failed', requestId, err: dbErr });
    }

    if (karmaCharged > 0) {
      try {
        await deps.karma.award(userId, karmaCharged, 'ai_plan_refund', requestId);
      } catch (refundErr) {
        logger.error({ msg: 'Failed to refund karma after AI plan failure', requestId, userId, err: refundErr });
      }
    }

    // "was charged", even if the refund call itself failed (that's logged above).
    const refunded = karmaCharged > 0;
    logger.info({ event: 'cta_ai_plan_failed', flowId, userId, requestId, refunded });
    capture(userId, 'cta_ai_plan_failed', { requestId, refunded });

    const planTitle = body.selectedOption.title;
    try {
      await deps.notifications.add({
        userId,
        type:  'ai_plan_failed',
        title: '⚠️ No pudimos generar tu plan',
        body:  karmaCharged > 0
          ? `No pudimos generar tu plan "${planTitle}". Te devolvimos ${karmaCharged} karma.`
          : `No pudimos generar tu plan "${planTitle}". Puedes intentarlo de nuevo.`,
        url:   `/my-trips?tab=aiplans&focus=${encodeURIComponent(requestId)}`,
      });
    } catch (notifyErr) {
      logger.error({ msg: 'Failed to insert ai_plan_failed notification', requestId, err: notifyErr });
    }
  }
}

/**
 * F79 first run: generate, keep only the chosen cities, save the trip, mark the row with its id,
 * then notify. Throws (→ the caller's failure path) when no stop survives. `saved.tripId` is set as soon
 * as the trip exists, so a later failure never hands the gift back for a plan the user already has.
 * No cta_ai_plan and no ai_plans trophy: nothing was paid.
 */
async function completeFirstPlan(
  deps: AiPlanJobDeps, params: AiPlanJobParams, cityIds: string[], saved: { tripId?: string },
): Promise<void> {
  const { requestId, userId, flowId, body, planChangeResult } = params;
  const result = restrictPlanToCities(await deps.ai.generatePlan(body, userId), cityIds);
  if (result.stops.length === 0) throw new Error('The generated plan has no stop in the chosen cities');

  const trip = await deps.trips!.create({
    title: result.title, stops: result.stops, transits: result.transits, ownerId: userId, sourceAiPlanRequestId: requestId,
  });
  saved.tripId = trip.id;
  await deps.aiPlanRequests.markCompleted(requestId, result, buildPlanChangeInfo(planChangeResult), trip.id);

  logger.info({ event: 'cta_first_plan_saved', flowId, userId, path: 'ai', requestId, tripId: trip.id });
  capture(userId, 'cta_first_plan_saved', { path: 'ai', requestId, tripId: trip.id });

  await deps.notifications.add({
    userId,
    type:  'ai_plan_ready',
    title: '🐾 Tu plan está listo',
    body:  `Tu primer plan "${result.title}" ya está guardado en Mis viajes.`,
    url:   `/my-trips?tab=trips&focus=${encodeURIComponent(trip.id)}`,
  });
}
