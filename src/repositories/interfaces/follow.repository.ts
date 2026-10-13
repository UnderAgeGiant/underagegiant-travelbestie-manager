export interface IFollowRepository {
  /** true when the row was newly inserted. */
  follow(followerId: string, followeeId: string): Promise<boolean>;
  unfollow(followerId: string, followeeId: string): Promise<void>;
  isFollowing(followerId: string, followeeId: string): Promise<boolean>;
  counts(userId: string): Promise<{ followerCount: number; followingCount: number }>;
  /** true only the first time ever for this pair (dedupes the new_follower notification). */
  markNotified(followerId: string, followeeId: string): Promise<boolean>;
}
