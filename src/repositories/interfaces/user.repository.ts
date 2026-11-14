import { User, Place } from '../../types';

export interface IUserRepository {
  create(data: { name: string; email: string; passwordHash: string }): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  update(
    userId: string,
    fields: { name?: string; email?: string; passwordHash?: string; countryOfResidence?: string | null; homePlace?: Place | null; username?: string },
  ): Promise<User>;
  /** F79: atomically takes the free first plan; true only when this call flipped NULL → now(). */
  claimFirstPlan(userId: string): Promise<boolean>;
  /** F79: gives the gift back (a failed first-run AI job or a failed INSERT after the claim). */
  releaseFirstPlan(userId: string): Promise<void>;
}
