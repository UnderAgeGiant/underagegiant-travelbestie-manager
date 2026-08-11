import { Pool } from 'pg';
import { ICollaboratorRepository } from '../interfaces/collaborator.repository';
import { CollaboratorRecord, PendingCollaboratorInvite } from '../../types';

export class PgCollaboratorRepository implements ICollaboratorRepository {
  constructor(private readonly pool: Pool) {}

  async invite(tripId: string, userId: string): Promise<string> {
    const { rows: [row] } = await this.pool.query(
      `INSERT INTO trip_collaborators (trip_id, user_id) VALUES ($1, $2) RETURNING invited_at`,
      [tripId, userId],
    );
    return (row.invited_at as Date).toISOString();
  }

  async accept(tripId: string, userId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE trip_collaborators SET accepted_at = now()
       WHERE trip_id = $1 AND user_id = $2 AND accepted_at IS NULL`,
      [tripId, userId],
    );
    return (rowCount ?? 0) > 0;
  }

  async remove(tripId: string, userId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM trip_collaborators WHERE trip_id = $1 AND user_id = $2`,
      [tripId, userId],
    );
  }

  async listForTrip(tripId: string): Promise<CollaboratorRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT c.user_id AS "userId", u.name, u.email,
              c.invited_at AS "invitedAt", c.accepted_at AS "acceptedAt"
       FROM trip_collaborators c
       JOIN users u ON u.user_id = c.user_id
       WHERE c.trip_id = $1
       ORDER BY c.invited_at ASC`,
      [tripId],
    );
    return rows.map(r => ({
      userId: r.userId as string,
      name: r.name as string,
      email: r.email as string,
      invitedAt: (r.invitedAt as Date).toISOString(),
      acceptedAt: r.acceptedAt ? (r.acceptedAt as Date).toISOString() : null,
    }));
  }

  async isAcceptedCollaborator(tripId: string, userId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `SELECT 1 FROM trip_collaborators WHERE trip_id = $1 AND user_id = $2 AND accepted_at IS NOT NULL`,
      [tripId, userId],
    );
    return (rowCount ?? 0) > 0;
  }

  async isAlreadyInvited(tripId: string, userId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `SELECT 1 FROM trip_collaborators WHERE trip_id = $1 AND user_id = $2`,
      [tripId, userId],
    );
    return (rowCount ?? 0) > 0;
  }

  async findAcceptedTripsForUser(userId: string): Promise<Array<{ tripId: string; ownerName: string; ownerEmail: string }>> {
    const { rows } = await this.pool.query(
      `SELECT c.trip_id AS "tripId", u.name AS "ownerName", u.email AS "ownerEmail"
       FROM trip_collaborators c
       JOIN trips t ON t.trip_id = c.trip_id
       JOIN users u ON u.user_id = t.owner_id
       WHERE c.user_id = $1 AND c.accepted_at IS NOT NULL`,
      [userId],
    );
    return rows.map(r => ({
      tripId: r.tripId as string,
      ownerName: r.ownerName as string,
      ownerEmail: r.ownerEmail as string,
    }));
  }

  async listPendingForUser(userId: string): Promise<PendingCollaboratorInvite[]> {
    const { rows } = await this.pool.query(
      `SELECT c.trip_id AS "tripId", t.title AS "tripTitle", u.name AS "ownerName", c.invited_at AS "invitedAt"
       FROM trip_collaborators c
       JOIN trips t ON t.trip_id = c.trip_id
       JOIN users u ON u.user_id = t.owner_id
       WHERE c.user_id = $1 AND c.accepted_at IS NULL
       ORDER BY c.invited_at DESC`,
      [userId],
    );
    return rows.map(r => ({
      tripId: r.tripId as string,
      tripTitle: r.tripTitle as string,
      ownerName: r.ownerName as string,
      invitedAt: (r.invitedAt as Date).toISOString(),
    }));
  }
}
