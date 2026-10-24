import { Trip, TripStop, TransitLeg, SharedTripPayload, FeedPage, FeedPlan, SeoSharedRow, SeoSitemapRow, SeoCityPlanRow, CostSettings, CostEstimate } from '../../types';
import { FeedCursor } from '../../lib/feed-cursor';

export interface ITripRepository {
  create(data: {
    title: string; stops: TripStop[]; transits: TransitLeg[]; ownerId: string;
    sourceAiPlanRequestId?: string; sourcePlanSessionId?: string;
    costSettings?: CostSettings; costEstimate?: CostEstimate | null;
  }): Promise<Trip>;
  findByOwner(ownerId: string): Promise<Trip[]>;
  findById(id: string): Promise<Trip | null>;
  update(id: string, data: Partial<Pick<Trip, 'title' | 'stops' | 'transits' | 'costSettings'>>): Promise<Trip | null>;
  saveEstimate(id: string, estimate: CostEstimate): Promise<void>;
  setShareId(id: string, shareId: string): Promise<Trip | null>;
  /** Unpublish: share_id = NULL. Idempotent; leaves updated_at alone. */
  clearShare(id: string): Promise<void>;
  setExportedAt(id: string): Promise<void>;
  findByShareId(shareId: string): Promise<SharedTripPayload | null>;
  findManyByShareIds(shareIds: string[]): Promise<SharedTripPayload[]>;
  searchShared(query: string): Promise<SharedTripPayload[]>;
  listFeed(cursor: FeedCursor | null, limit: number): Promise<FeedPage>;
  listFollowingFeed(followerId: string, cursor: FeedCursor | null, limit: number): Promise<FeedPage>;
  listSharedByOwner(ownerId: string, limit: number): Promise<FeedPlan[]>;
  findSeoRow(shareId: string): Promise<SeoSharedRow | null>;
  listSeoIndex(minAttractions: number, limit: number): Promise<SeoSitemapRow[]>;
  listSeoCityPlans(cityId: string, minAttractions: number, limit: number): Promise<SeoCityPlanRow[]>;
  delete(id: string): Promise<boolean>;
}
