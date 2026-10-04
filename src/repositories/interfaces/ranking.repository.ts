import { MyRankings, WeeklyRankings } from '../../types';

export interface IRankingRepository {
  getWeekly(weekStart: string): Promise<WeeklyRankings>;
  getMine(weekStart: string, userId: string): Promise<MyRankings>;
}
