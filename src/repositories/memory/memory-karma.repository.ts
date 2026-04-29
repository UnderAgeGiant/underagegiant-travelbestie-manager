import { Karma } from '../../types';
import { IKarmaRepository } from '../interfaces/karma.repository';

export class MemoryKarmaRepository implements IKarmaRepository {
  private scores = new Map<string, number>();

  async get(email: string): Promise<Karma> {
    return { email, score: this.scores.get(email) ?? 0 };
  }

  async apply(email: string, delta: number): Promise<Karma> {
    const current = this.scores.get(email) ?? 0;
    const next = current + delta;
    this.scores.set(email, next);
    return { email, score: next };
  }
}
