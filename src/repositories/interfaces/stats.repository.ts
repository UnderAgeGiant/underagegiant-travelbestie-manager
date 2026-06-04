import { AppStats } from '../../types';

export interface IStatsRepository {
  get(): Promise<AppStats>;
}
