import { randomUUID } from 'crypto';
import { Trip, TripStop, TransitLeg } from '../../types';
import { ITripRepository } from '../interfaces/trip.repository';

export class MemoryTripRepository implements ITripRepository {
  private trips = new Map<string, Trip>();

  async create(data: { title: string; stops: TripStop[]; transits: TransitLeg[]; ownerId: string }): Promise<Trip> {
    const trip: Trip = { id: randomUUID(), ...data, createdAt: new Date().toISOString() };
    this.trips.set(trip.id, trip);
    return trip;
  }

  async findByOwner(ownerId: string): Promise<Trip[]> {
    return Array.from(this.trips.values()).filter(t => t.ownerId === ownerId);
  }

  async findById(id: string): Promise<Trip | null> {
    return this.trips.get(id) ?? null;
  }

  async update(id: string, data: Partial<Pick<Trip, 'title' | 'stops' | 'transits'>>): Promise<Trip | null> {
    const trip = this.trips.get(id);
    if (!trip) return null;
    const updated = { ...trip, ...data };
    this.trips.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.trips.delete(id);
  }
}
