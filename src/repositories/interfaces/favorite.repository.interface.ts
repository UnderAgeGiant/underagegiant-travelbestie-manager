import { FavoriteToggleResult, FavoritedTrip } from '../../types';

export interface IFavoriteRepository {
  /** Insert if absent, delete if present. Returns new state + updated count. */
  toggle(userId: string, tripId: string): Promise<FavoriteToggleResult>;

  /** All trips favourited by userId, ordered by created_at DESC. */
  list(userId: string): Promise<FavoritedTrip[]>;

  /** Count of favourites + whether userId has favourited (null userId → isFavoritedByMe: false). */
  getCountAndStatus(tripId: string, userId: string | null): Promise<{ favoriteCount: number; isFavoritedByMe: boolean }>;
}
