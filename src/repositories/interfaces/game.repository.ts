import { FinishRunResponse } from '../../types';

export interface IGameRepository {
  /** Keeps the max per (user, week); newRecord = this score replaced (or created) the week's best. */
  saveBest(userId: string, weekStart: string, score: number): Promise<FinishRunResponse>;
}
