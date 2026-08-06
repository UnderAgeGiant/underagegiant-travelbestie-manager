import { CollaboratorRecord, PendingCollaboratorInvite } from '../../types';

export interface ICollaboratorRepository {
  /** Inserts a pending row. Returns the ISO invited_at timestamp. */
  invite(tripId: string, userId: string): Promise<string>;

  /** Sets accepted_at on the matching pending row. Returns false if none existed. */
  accept(tripId: string, userId: string): Promise<boolean>;

  /** Removes the row (pending or accepted) — idempotent. */
  remove(tripId: string, userId: string): Promise<void>;

  listForTrip(tripId: string): Promise<CollaboratorRecord[]>;

  isAcceptedCollaborator(tripId: string, userId: string): Promise<boolean>;

  /** True whether the row is pending or already accepted. */
  isAlreadyInvited(tripId: string, userId: string): Promise<boolean>;

  findAcceptedTripsForUser(userId: string): Promise<Array<{ tripId: string; ownerName: string; ownerEmail: string }>>;

  listPendingForUser(userId: string): Promise<PendingCollaboratorInvite[]>;
}
