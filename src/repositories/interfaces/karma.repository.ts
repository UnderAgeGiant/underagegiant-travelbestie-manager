import { Karma } from '../../types';

export interface IKarmaRepository {
  get(email: string): Promise<Karma>;
  apply(email: string, delta: number): Promise<Karma>;
}
