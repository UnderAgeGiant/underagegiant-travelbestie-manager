import { randomUUID } from 'crypto';
import { IUserRepository } from '../../src/repositories/interfaces/user.repository';
import { ITripRepository } from '../../src/repositories/interfaces/trip.repository';
import { ICommentRepository } from '../../src/repositories/interfaces/comment.repository';
import { IKarmaRepository } from '../../src/repositories/interfaces/karma.repository';
import { User, Trip, TripStop, TransitLeg, Comment, Karma, SharedTripPayload } from '../../src/types';

export class StubUserRepository implements IUserRepository {
  private byEmail = new Map<string, User>();
  private byId    = new Map<string, User>();

  async create(data: { name: string; email: string; passwordHash: string }): Promise<User> {
    const user: User = { id: randomUUID(), ...data, email: data.email.toLowerCase(), createdAt: new Date().toISOString() };
    this.byEmail.set(user.email, user);
    this.byId.set(user.id, user);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.byEmail.get(email.toLowerCase()) ?? null;
  }

  async findById(id: string): Promise<User | null> {
    return this.byId.get(id) ?? null;
  }
}

export class StubTripRepository implements ITripRepository {
  private trips = new Map<string, Trip>();

  async create(data: { title: string; stops: TripStop[]; transits: TransitLeg[]; ownerId: string }): Promise<Trip> {
    const trip: Trip = { id: randomUUID(), ...data, createdAt: new Date().toISOString() };
    this.trips.set(trip.id, trip);
    return trip;
  }

  async findByOwner(ownerId: string): Promise<Trip[]> {
    return [...this.trips.values()].filter(t => t.ownerId === ownerId);
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

  async setShareId(id: string, shareId: string): Promise<Trip | null> {
    const trip = this.trips.get(id);
    if (!trip) return null;
    const updated = { ...trip, shareId };
    this.trips.set(id, updated);
    return updated;
  }

  async findByShareId(shareId: string): Promise<SharedTripPayload | null> {
    const trip = [...this.trips.values()].find(t => t.shareId === shareId);
    if (!trip) return null;
    return { id: shareId, tripName: trip.title, ownerEmail: '', ownerName: '', createdAt: trip.createdAt, stops: trip.stops, transits: trip.transits };
  }

  async delete(id: string): Promise<boolean> {
    return this.trips.delete(id);
  }
}

export class StubCommentRepository implements ICommentRepository {
  private comments = new Map<string, Comment[]>();

  async add(data: Omit<Comment, 'id' | 'createdAt'> & { userId: string }): Promise<Comment> {
    const { userId: _userId, ...rest } = data;
    const comment: Comment = { id: randomUUID(), ...rest, createdAt: new Date().toISOString() };
    const list = this.comments.get(data.attractionId) ?? [];
    this.comments.set(data.attractionId, [...list, comment]);
    return comment;
  }

  async findByAttraction(attractionId: string): Promise<Comment[]> {
    return this.comments.get(attractionId) ?? [];
  }
}

export class StubKarmaRepository implements IKarmaRepository {
  async get(email: string): Promise<Karma> {
    return { email, score: 0 };
  }

  async spend(_userId: string, _refId: string): Promise<void> {}
  async spendAmount(_userId: string, _amount: number, _reason: string, _refId: string): Promise<void> {}
}
