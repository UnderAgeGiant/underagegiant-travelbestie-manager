import { AiPlanRequestParams, AiPlanRequestRecord, PlanChangeInfo, PlanTripResponse } from '../../types';

export interface IAiPlanRequestRepository {
  /** Creates a 'pending' row for a newly-accepted /ai/plan call. */
  insert(data: {
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
}
