import { Trip, TripStop, TransitLeg, SharedTripPayload } from '../../types';

export interface ITripRepository {
  create(data: { title: string; stops: TripStop[]; transits: TransitLeg[]; ownerId: string }): Promise<Trip>;
  findByOwner(ownerId: string): Promise<Trip[]>;
  findById(id: string): Promise<Trip | null>;
  update(id: string, data: Partial<Pick<Trip, 'title' | 'stops' | 'transits'>>): Promise<Trip | null>;
  setShareId(id: string, shareId: string): Promise<Trip | null>;
  setExportedAt(id: string): Promise<void>;
  findByShareId(shareId: string): Promise<SharedTripPayload | null>;
  searchShared(query: string): Promise<SharedTripPayload[]>;
  delete(id: string): Promise<boolean>;
}
