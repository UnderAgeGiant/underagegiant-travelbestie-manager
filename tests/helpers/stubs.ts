import { randomUUID } from 'crypto';
import { IUserRepository } from '../../src/repositories/interfaces/user.repository';
import { ITripRepository } from '../../src/repositories/interfaces/trip.repository';
import { ICommentRepository } from '../../src/repositories/interfaces/comment.repository';
import { IKarmaRepository } from '../../src/repositories/interfaces/karma.repository';
import { IKarmaPurchaseRepository } from '../../src/repositories/interfaces/karma-purchase.repository';
import { IStepCommentRepository } from '../../src/repositories/interfaces/step-comment.repository';
import { User, Trip, TripStop, TransitLeg, Comment, Karma, SharedTripPayload, KarmaPurchase, CompleteKarmaPurchaseResult, StepComment, StepCommentsMap, FavoriteToggleResult, FavoritedTrip, NotificationRecord, NotificationType } from '../../src/types';
import { IFavoriteRepository } from '../../src/repositories/interfaces/favorite.repository.interface';
import { INotificationRepository, NOTIFICATIONS_LIST_LIMIT } from '../../src/repositories/interfaces/notification.repository';
import { ICollaboratorRepository } from '../../src/repositories/interfaces/collaborator.repository';
import { CollaboratorRecord, PendingCollaboratorInvite } from '../../src/types';
import { IHighlightRepository } from '../../src/repositories/interfaces/highlight.repository.interface';

export class StubUserRepository implements IUserRepository {
  private byEmail = new Map<string, User>();
  private byId    = new Map<string, User>();

  constructor(initialUsers: User[] = []) {
    for (const user of initialUsers) {
      const copy = { ...user };
      this.byEmail.set(copy.email.toLowerCase(), copy);
      this.byId.set(copy.id, copy);
    }
  }

  async create(data: { name: string; email: string; passwordHash: string }): Promise<User> {
    const user: User = { id: randomUUID(), ...data, email: data.email.toLowerCase(), homeCity: null, createdAt: new Date().toISOString() };
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

  async update(
    userId: string,
    fields: { name?: string; email?: string; passwordHash?: string; homeCity?: string | null },
  ): Promise<User> {
    const user = this.byId.get(userId);
    if (!user) throw new Error('User not found');
    if (fields.name !== undefined) user.name = fields.name;
    if (fields.email !== undefined) {
      this.byEmail.delete(user.email);
      user.email = fields.email.toLowerCase();
      this.byEmail.set(user.email, user);
    }
    if (fields.passwordHash !== undefined) user.passwordHash = fields.passwordHash;
    if (fields.homeCity !== undefined) user.homeCity = fields.homeCity;
    return { ...user };
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

  async setExportedAt(id: string): Promise<void> {
    const trip = this.trips.get(id);
    if (trip) this.trips.set(id, { ...trip, itineraryExportedAt: new Date().toISOString() });
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
    return { id: shareId, tripName: trip.title, ownerEmail: '', ownerName: '', createdAt: trip.createdAt, stops: trip.stops, transits: trip.transits, planId: trip.id, tripId: trip.id, ownerId: trip.ownerId };
  }

  async findManyByShareIds(shareIds: string[]): Promise<SharedTripPayload[]> {
    const results: SharedTripPayload[] = [];
    for (const id of shareIds) {
      const found = await this.findByShareId(id);
      if (found) results.push(found);
    }
    return results;
  }

  async searchShared(query: string): Promise<SharedTripPayload[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return [...this.trips.values()]
      .filter(t => t.shareId && t.title.toLowerCase().includes(q))
      .slice(0, 5)
      .map(t => ({ id: t.shareId!, tripName: t.title, ownerEmail: '', ownerName: '', createdAt: t.createdAt, stops: t.stops, transits: t.transits, planId: t.id, tripId: t.id }));
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

  async findByAttractions(ids: string[]): Promise<Record<string, Comment[]>> {
    const result: Record<string, Comment[]> = {};
    for (const id of ids) {
      result[id] = this.comments.get(id) ?? [];
    }
    return result;
  }
}

export class StubKarmaRepository implements IKarmaRepository {
  awarded: { userId: string; amount: number; reason: string; refId: string }[] = [];
  private score: number;

  constructor(initialScore = 100) { this.score = initialScore; }

  setScore(score: number): void { this.score = score; }

  async get(email: string): Promise<Karma> {
    return { email, score: this.score };
  }

  async spend(_userId: string, _refId: string): Promise<void> {}
  async spendAmount(_userId: string, _amount: number, _reason: string, _refId: string): Promise<void> {}
  async award(userId: string, amount: number, reason: string, refId: string): Promise<void> {
    this.awarded.push({ userId, amount, reason, refId });
  }
}

export class StubStepCommentRepository implements IStepCommentRepository {
  private comments: StepComment[] = [];
  private karmaSlots = new Set<string>();

  async getAllForTrip(tripId: string): Promise<StepCommentsMap> {
    const map: StepCommentsMap = {};
    for (const c of this.comments.filter(c => c.stepKey.startsWith(''))) {
      if (!map[c.stepKey]) map[c.stepKey] = [];
      map[c.stepKey].push(c);
    }
    return map;
  }

  async add(data: { tripId: string; stepKey: string; userId: string; authorName: string; text: string }): Promise<StepComment> {
    const comment: StepComment = {
      id: randomUUID(), stepKey: data.stepKey,
      authorName: data.authorName, text: data.text,
      createdAt: new Date().toISOString(),
    };
    this.comments.push(comment);
    return comment;
  }

  async isFirstCommentOnStep(userId: string, tripId: string, stepKey: string): Promise<boolean> {
    const key = `${userId}:${tripId}:${stepKey}`;
    if (this.karmaSlots.has(key)) return false;
    this.karmaSlots.add(key);
    return true;
  }
}

export class StubKarmaPurchaseRepository implements IKarmaPurchaseRepository {
  private store = new Map<string, KarmaPurchase>();

  async createPurchaseIntent(
    userId: string, provider: string, providerOrderId: string, packageId: string,
    karmaAmount: number, amount: string, currency: string,
  ): Promise<KarmaPurchase> {
    const p: KarmaPurchase = {
      purchaseId: randomUUID(), userId, provider, providerOrderId, providerCaptureId: null,
      packageId, karmaAmount, amount, currency, status: 'pending',
      createdAt: new Date().toISOString(), completedAt: null,
    };
    this.store.set(providerOrderId, p);
    return p;
  }

  async findByOrderId(providerOrderId: string): Promise<KarmaPurchase | null> {
    return this.store.get(providerOrderId) ?? null;
  }

  async completePurchase(providerOrderId: string, captureId: string): Promise<CompleteKarmaPurchaseResult> {
    const p = this.store.get(providerOrderId);
    if (!p) throw Object.assign(new Error('Not found'), { status: 404 });
    const completed: KarmaPurchase = {
      ...p, providerCaptureId: captureId,
      status: 'completed', completedAt: new Date().toISOString(),
    };
    this.store.set(providerOrderId, completed);
    return { purchase: completed, newKarmaTotal: p.karmaAmount };
  }

  async failPurchase(providerOrderId: string): Promise<void> {
    const p = this.store.get(providerOrderId);
    if (p) this.store.set(providerOrderId, { ...p, status: 'failed' });
  }
}

export class StubFavoriteRepository implements IFavoriteRepository {
  private rows: Array<{ userId: string; tripId: string; createdAt: Date }> = [];

  async toggle(userId: string, tripId: string): Promise<FavoriteToggleResult> {
    const idx = this.rows.findIndex(r => r.userId === userId && r.tripId === tripId);
    if (idx >= 0) {
      this.rows.splice(idx, 1);
    } else {
      this.rows.push({ userId, tripId, createdAt: new Date() });
    }
    const favoriteCount = this.rows.filter(r => r.tripId === tripId).length;
    return { favorited: idx < 0, favoriteCount };
  }

  async list(userId: string): Promise<FavoritedTrip[]> {
    return this.rows
      .filter(r => r.userId === userId)
      .map(r => ({
        id:              'stub-share-id',
        shareId:         'stub-share-id',
        tripId:          r.tripId,
        planId:          r.tripId,
        tripName:        'Stub Trip',
        ownerName:       'Stub Owner',
        ownerEmail:      '',
        createdAt:       new Date().toISOString(),
        stops:           [],
        transits:        [],
        favoritedAt:     r.createdAt.toISOString(),
        favoriteCount:   1,
        isFavoritedByMe: true,
      }));
  }

  async getCountAndStatus(tripId: string, userId: string | null) {
    const favoriteCount   = this.rows.filter(r => r.tripId === tripId).length;
    const isFavoritedByMe = !!userId && this.rows.some(r => r.tripId === tripId && r.userId === userId);
    return { favoriteCount, isFavoritedByMe };
  }
}

export class StubHighlightRepository implements IHighlightRepository {
  private seen = new Set<string>(); // `${userId}:${highlightType}`

  async hasSeen(userId: string, highlightType: string): Promise<boolean> {
    return this.seen.has(`${userId}:${highlightType}`);
  }

  async markSeen(userId: string, highlightType: string): Promise<void> {
    this.seen.add(`${userId}:${highlightType}`);
  }
}

export class StubNotificationRepository implements INotificationRepository {
  items: NotificationRecord[] = [];
  mutedUsers = new Set<string>();

  async add(data: { userId: string; type: NotificationType; title: string; body: string; url: string }): Promise<void> {
    if (this.mutedUsers.has(data.userId)) return;
    this.items.unshift({ notificationId: randomUUID(), ...data, read: false, createdAt: new Date().toISOString() });
  }

  async listByUser(userId: string): Promise<NotificationRecord[]> {
    return this.items.filter(n => n.userId === userId).slice(0, NOTIFICATIONS_LIST_LIMIT).map(n => ({ ...n }));
  }

  async countUnread(userId: string): Promise<number> {
    return this.items.filter(n => n.userId === userId && !n.read).length;
  }

  async getStatus(userId: string): Promise<{ count: number; muted: boolean }> {
    return { count: await this.countUnread(userId), muted: await this.isMuted(userId) };
  }

  async markAllRead(userId: string): Promise<void> {
    this.items = this.items.map(n => (n.userId === userId ? { ...n, read: true } : n));
  }

  async isMuted(userId: string): Promise<boolean> {
    return this.mutedUsers.has(userId);
  }

  async setMuted(userId: string, muted: boolean): Promise<void> {
    if (muted) this.mutedUsers.add(userId);
    else this.mutedUsers.delete(userId);
  }
}

export class StubCollaboratorRepository implements ICollaboratorRepository {
  rows: Array<{ tripId: string; userId: string; invitedAt: string; acceptedAt: string | null }> = [];

  constructor(
    private readonly users: StubUserRepository,
    private readonly trips: StubTripRepository,
  ) {}

  async invite(tripId: string, userId: string): Promise<string> {
    const invitedAt = new Date().toISOString();
    this.rows.push({ tripId, userId, invitedAt, acceptedAt: null });
    return invitedAt;
  }

  async accept(tripId: string, userId: string): Promise<boolean> {
    const row = this.rows.find(r => r.tripId === tripId && r.userId === userId && r.acceptedAt === null);
    if (!row) return false;
    row.acceptedAt = new Date().toISOString();
    return true;
  }

  async remove(tripId: string, userId: string): Promise<void> {
    this.rows = this.rows.filter(r => !(r.tripId === tripId && r.userId === userId));
  }

  async listForTrip(tripId: string): Promise<CollaboratorRecord[]> {
    const result: CollaboratorRecord[] = [];
    for (const r of this.rows.filter(x => x.tripId === tripId)) {
      const user = await this.users.findById(r.userId);
      result.push({ userId: r.userId, name: user?.name ?? '', email: user?.email ?? '', invitedAt: r.invitedAt, acceptedAt: r.acceptedAt });
    }
    return result;
  }

  async isAcceptedCollaborator(tripId: string, userId: string): Promise<boolean> {
    return this.rows.some(r => r.tripId === tripId && r.userId === userId && r.acceptedAt !== null);
  }

  async isAlreadyInvited(tripId: string, userId: string): Promise<boolean> {
    return this.rows.some(r => r.tripId === tripId && r.userId === userId);
  }

  async findAcceptedTripsForUser(userId: string): Promise<Array<{ tripId: string; ownerName: string; ownerEmail: string }>> {
    const result: Array<{ tripId: string; ownerName: string; ownerEmail: string }> = [];
    for (const r of this.rows.filter(x => x.userId === userId && x.acceptedAt !== null)) {
      const trip = await this.trips.findById(r.tripId);
      const owner = trip ? await this.users.findById(trip.ownerId) : null;
      result.push({ tripId: r.tripId, ownerName: owner?.name ?? '', ownerEmail: owner?.email ?? '' });
    }
    return result;
  }

  async listPendingForUser(userId: string): Promise<PendingCollaboratorInvite[]> {
    const result: PendingCollaboratorInvite[] = [];
    for (const r of this.rows.filter(x => x.userId === userId && x.acceptedAt === null)) {
      const trip = await this.trips.findById(r.tripId);
      const owner = trip ? await this.users.findById(trip.ownerId) : null;
      result.push({ tripId: r.tripId, tripTitle: trip?.title ?? '', ownerName: owner?.name ?? '', invitedAt: r.invitedAt });
    }
    return result;
  }
}
