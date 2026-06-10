import { Comment } from '../../types';

export interface ICommentRepository {
  add(data: Omit<Comment, 'id' | 'createdAt'> & { userId: string }): Promise<Comment>;
  findByAttraction(attractionId: string): Promise<Comment[]>;
  findByAttractions(ids: string[]): Promise<Record<string, Comment[]>>;
}
