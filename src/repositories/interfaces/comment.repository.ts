import { Comment } from '../../types';

export interface ICommentRepository {
  add(data: Omit<Comment, 'id' | 'createdAt'>): Promise<Comment>;
  findByAttraction(attractionId: string): Promise<Comment[]>;
  hasCommented(email: string, attractionId: string): Promise<boolean>;
}
