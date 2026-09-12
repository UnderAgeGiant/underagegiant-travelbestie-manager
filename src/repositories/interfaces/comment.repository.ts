import { Comment } from '../../types';

export interface ICommentRepository {
  add(data: Omit<Comment, 'id' | 'createdAt'> & { userId: string }): Promise<Comment>;
  findByAttraction(attractionId: string): Promise<Comment[]>;
  findByAttractions(ids: string[]): Promise<Record<string, Comment[]>>;
  /** Attempts to mark (userId, attractionId) as karma-granted; returns true only the
   *  first time for a given pair (i.e. this is the user's first comment on this
   *  attraction), backed by a PK-guarded insert into user_attraction_karma. */
  markFirstAttractionComment(userId: string, attractionId: string): Promise<boolean>;
}
