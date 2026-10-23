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
}
