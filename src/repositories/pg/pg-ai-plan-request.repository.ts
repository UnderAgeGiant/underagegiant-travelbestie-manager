import { Pool } from 'pg';
import { IAiPlanRequestRepository } from '../interfaces/ai-plan-request.repository';
import { AiPlanRequestParams, AiPlanRequestRecord, PlanChangeInfo, PlanTripResponse } from '../../types';

const SELECT_COLUMNS = `
  request_id AS "requestId", user_id AS "userId", plan_session_id AS "planSessionId",
  status, karma_charged AS "karmaCharged", request_params AS "requestParams",
  result, change_info AS "changeInfo", error_message AS "errorMessage",
  created_at AS "createdAt", completed_at AS "completedAt"
`;

interface Row {
  requestId: string;
  userId: string;
  planSessionId: string;
  status: 'pending' | 'completed' | 'failed';
  karmaCharged: number;
  requestParams: AiPlanRequestParams;
  result: PlanTripResponse | null;
  changeInfo: PlanChangeInfo | null;
  errorMessage: string | null;
  createdAt: Date | string;
  completedAt: Date | string | null;
}

function mapRow(row: Row): AiPlanRequestRecord {
  return {
    requestId:     row.requestId,
    userId:        row.userId,
    planSessionId: row.planSessionId,
    status:        row.status,
    karmaCharged:  row.karmaCharged,
    requestParams: row.requestParams,
    result:        row.result ?? undefined,
    changeInfo:    row.changeInfo ?? undefined,
    errorMessage:  row.errorMessage ?? undefined,
    createdAt:     row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    completedAt:   row.completedAt instanceof Date ? row.completedAt.toISOString() : row.completedAt ?? undefined,
  };
}

export class PgAiPlanRequestRepository implements IAiPlanRequestRepository {
  constructor(private readonly pool: Pool) {}

  async insert(data: {
    userId: string;
    planSessionId: string;
    karmaCharged: number;
    requestParams: AiPlanRequestParams;
  }): Promise<AiPlanRequestRecord> {
    const { rows: [row] } = await this.pool.query(
      `INSERT INTO ai_plan_requests (user_id, plan_session_id, karma_charged, request_params)
       VALUES ($1, $2, $3, $4)
       RETURNING ${SELECT_COLUMNS}`,
      [data.userId, data.planSessionId, data.karmaCharged, JSON.stringify(data.requestParams)],
    );
    return mapRow(row as Row);
  }

  async markCompleted(requestId: string, result: PlanTripResponse, changeInfo: PlanChangeInfo): Promise<void> {
    await this.pool.query(
      `UPDATE ai_plan_requests
       SET status = 'completed', result = $2, change_info = $3, completed_at = now()
       WHERE request_id = $1`,
      [requestId, JSON.stringify(result), JSON.stringify(changeInfo)],
    );
  }

  async markFailed(requestId: string, errorMessage: string): Promise<void> {
    await this.pool.query(
      `UPDATE ai_plan_requests
       SET status = 'failed', error_message = $2, completed_at = now()
       WHERE request_id = $1`,
      [requestId, errorMessage],
    );
  }

  async findById(requestId: string): Promise<AiPlanRequestRecord | null> {
    const { rows: [row] } = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM ai_plan_requests WHERE request_id = $1`,
      [requestId],
    );
    return row ? mapRow(row as Row) : null;
  }

  async listByUser(userId: string): Promise<AiPlanRequestRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM ai_plan_requests
       WHERE user_id = $1 AND status IN ('completed', 'failed')
       ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map(r => mapRow(r as Row));
  }
}
