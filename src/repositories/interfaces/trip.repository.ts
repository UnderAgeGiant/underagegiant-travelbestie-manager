import { Trip, TripStop, TransitLeg, SharedTripPayload, FeedPage, SeoSharedRow, SeoSitemapRow, SeoCityPlanRow } from '../../types';
import { FeedCursor } from '../../lib/feed-cursor';

export interface ITripRepository {
  create(data: {
    title: string; stops: TripStop[]; transits: TransitLeg[]; ownerId: string;
    sourceAiPlanRequestId?: string; sourcePlanSessionId?: string;
  }): Promise<Trip>;
  findByOwner(ownerId: string): Promise<Trip[]>;
  findById(id: string): Promise<Trip | null>;
  update(id: string, data: Partial<Pick<Trip, 'title' | 'stops' | 'transits'>>): Promise<Trip | null>;
  setShareId(id: string, shareId: string): Promise<Trip | null>;
  setExportedAt(id: string): Promise<void>;
  findByShareId(shareId: string): Promise<SharedTripPayload | null>;
  findManyByShareIds(shareIds: string[]): Promise<SharedTripPayload[]>;
  searchShared(query: string): Promise<SharedTripPayload[]>;
  listFeed(cursor: FeedCursor | null, limit: number): Promise<FeedPage>;
  findSeoRow(shareId: string): Promise<SeoSharedRow | null>;
  listSeoIndex(minAttractions: number, limit: number): Promise<SeoSitemapRow[]>;
  listSeoCityPlans(cityId: string, minAttractions: number, limit: number): Promise<SeoCityPlanRow[]>;
  delete(id: string): Promise<boolean>;
}
