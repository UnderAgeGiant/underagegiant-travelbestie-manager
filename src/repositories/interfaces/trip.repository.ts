import { Trip, TripStop, TransitLeg } from '../../types';

export interface ITripRepository {
  create(data: { title: string; stops: TripStop[]; transits: TransitLeg[]; ownerId: string }): Promise<Trip>;
  findByOwner(ownerId: string): Promise<Trip[]>;
  findById(id: string): Promise<Trip | null>;
  update(id: string, data: Partial<Pick<Trip, 'title' | 'stops' | 'transits'>>): Promise<Trip | null>;
  delete(id: string): Promise<boolean>;
}
