import { AiPlanRequestParams, AiPlanRequestRecord, PlanChangeInfo, PlanTripResponse } from '../../types';

export interface IAiPlanRequestRepository {
  /** Creates a 'pending' row for a newly-accepted /ai/plan call. */
  insert(data: {
    requestId:     string;
    userId:        string;
    planSessionId: string;
    karmaCharged:  number;
    requestParams: AiPlanRequestParams;
  }): Promise<AiPlanRequestRecord>;

  /** Marks a row 'completed' with the generated plan + change info. */
  markCompleted(requestId: string, result: PlanTripResponse, changeInfo: PlanChangeInfo): Promise<void>;

  /** Marks a row 'failed' with the error message. */
  markFailed(requestId: string, errorMessage: string): Promise<void>;

  findById(requestId: string): Promise<AiPlanRequestRecord | null>;

  /** completed + failed rows only (pending rows belong on the live poll, not history), newest first. */
  listByUser(userId: string): Promise<AiPlanRequestRecord[]>;

  /** Permanently removes one request row — called after a successful save (Step 3's "Guardar"), when a fresh generation supersedes a previously-tracked one, or when "↩ Volver a empezar" abandons the current result (Tasks 31–33 above). Scoped to userId as a defense-in-depth check; the route chain's checkAiPlanRequestOwnership already 404s before this runs, so this should never actually reject in practice. Never called on a 'failed' row — see discard() below. */
  delete(requestId: string, userId: string): Promise<void>;

  /** Soft-deletes a FAILED request row — sets discarded_at so it disappears from GET /ai/plan/history and the "Planes IA Pendientes" tab, while the row (and its error_message) stays in the table for later failure analysis. Called by the manual "Descartar" button (Task 35), which only ever appears on a failed card. Scoped to userId, same defense-in-depth note as delete() above. */
  discard(requestId: string, userId: string): Promise<void>;
}
