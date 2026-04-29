import { randomUUID } from 'crypto';
import { Comment } from '../../types';
import { ICommentRepository } from '../interfaces/comment.repository';

export class MemoryCommentRepository implements ICommentRepository {
  private comments = new Map<string, Comment[]>();
  private seen = new Set<string>(); // `${email}:${attractionId}`

  async add(data: Omit<Comment, 'id' | 'createdAt'> & { authorEmail?: string }): Promise<Comment> {
    const { authorEmail, ...rest } = data as typeof data & { authorEmail?: string };
    const comment: Comment = { id: randomUUID(), ...rest, createdAt: new Date().toISOString() };
    const existing = this.comments.get(data.attractionId) ?? [];
    this.comments.set(data.attractionId, [...existing, comment]);
    if (authorEmail) this.seen.add(`${authorEmail}:${data.attractionId}`);
    return comment;
  }

  async findByAttraction(attractionId: string): Promise<Comment[]> {
    return this.comments.get(attractionId) ?? [];
  }

  async hasCommented(email: string, attractionId: string): Promise<boolean> {
    return this.seen.has(`${email}:${attractionId}`);
  }

  markCommented(email: string, attractionId: string): void {
    this.seen.add(`${email}:${attractionId}`);
  }
}
