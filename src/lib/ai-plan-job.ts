import { AiController } from '../controllers/ai.controller';
import { IAiPlanRequestRepository } from '../repositories/interfaces/ai-plan-request.repository';
import { IKarmaRepository } from '../repositories/interfaces/karma.repository';
import { INotificationRepository } from '../repositories/interfaces/notification.repository';
import { AiPlanBody } from '../schemas/ai.schemas';
import { PlanChangeResult } from '../types';
import { buildPlanChangeInfo, toSessionOptions } from './plan-change-detector';
import { writePlanSession } from './plan-session-store';
import { logger } from './logger';

export interface AiPlanJobDeps {
  ai:            AiController;
  aiPlanRequests: IAiPlanRequestRepository;
  karma:         IKarmaRepository;
  notifications: INotificationRepository;
}

export interface AiPlanJobParams {
  requestId:        string;
  userId:           string;
  flowId:            string;
  body:             AiPlanBody;
  planChangeResult: PlanChangeResult;
  karmaCharged:     number;
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
  const { requestId, userId, flowId, body, planChangeResult, karmaCharged } = params;

  try {
    const result = await deps.ai.generatePlan(body);

    if (body.planSessionId) {
      await writePlanSession(userId, body.planSessionId, planChangeResult, toSessionOptions(body));
    }

    const changeInfo = buildPlanChangeInfo(planChangeResult);
    await deps.aiPlanRequests.markCompleted(requestId, result, changeInfo);

    logger.info({ event: 'cta_ai_plan', flowId, userId, changeType: planChangeResult.type, requestId });

    await deps.notifications.add({
      userId,
      type:  'ai_plan_ready',
      title: '🐾 Tu plan está listo',
      body:  `Tu plan "${result.title}" ya está listo. Revísalo en Mis Planes IA.`,
      url:   '/',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error generating plan';
    logger.error({ msg: 'AI plan generation failed', requestId, userId, flowId, err: message });

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

    const planTitle = body.selectedOption.title;
    try {
      await deps.notifications.add({
        userId,
        type:  'ai_plan_failed',
        title: '⚠️ No pudimos generar tu plan',
        body:  karmaCharged > 0
          ? `No pudimos generar tu plan "${planTitle}". Te devolvimos ${karmaCharged} karma.`
          : `No pudimos generar tu plan "${planTitle}". Puedes intentarlo de nuevo.`,
        url:   '/',
      });
    } catch (notifyErr) {
      logger.error({ msg: 'Failed to insert ai_plan_failed notification', requestId, err: notifyErr });
    }
  }
}
