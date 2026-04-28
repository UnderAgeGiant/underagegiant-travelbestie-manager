import { randomUUID } from 'crypto';
import { User } from '../../types';
import { IUserRepository } from '../interfaces/user.repository';

export class MemoryUserRepository implements IUserRepository {
  private users = new Map<string, User>();

  async create(data: { name: string; email: string; passwordHash: string }): Promise<User> {
    const user: User = { id: randomUUID(), ...data, createdAt: new Date().toISOString() };
    this.users.set(user.id, user);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) return u;
    }
    return null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }
}
