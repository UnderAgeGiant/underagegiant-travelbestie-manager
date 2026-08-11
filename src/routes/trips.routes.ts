import { Router, RequestHandler } from 'express';
import { TripController } from '../controllers/trip.controller';
import { KarmaController } from '../controllers/karma.controller';
import { CollaboratorController } from '../controllers/collaborator.controller';
import { ICollaboratorRepository } from '../repositories/interfaces/collaborator.repository';
import { IUserRepository } from '../repositories/interfaces/user.repository';
import { ITripRepository } from '../repositories/interfaces/trip.repository';
import { INotificationRepository } from '../repositories/interfaces/notification.repository';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { validateBody } from '../middleware/validate-body.middleware';
import { createTripSchema } from '../schemas/trip.schemas';
import { inviteCollaboratorSchema } from '../schemas/collaborator.schemas';
import { checkTripOwnership } from '../middleware/trips/check-trip-ownership.middleware';
import { makeCheckTripEditAccess } from '../middleware/collaborators/check-trip-edit-access.middleware';
import { makeResolveInvitee } from '../middleware/collaborators/resolve-invitee.middleware';
import { makeCheckInviteTarget } from '../middleware/collaborators/check-invite-target.middleware';
import { requireAcceptedInvite } from '../middleware/collaborators/require-accepted-invite.middleware';
import { makeAttachCollaboratorTrips } from '../middleware/collaborators/attach-collaborator-trips.middleware';
import { sendCollaboratorInviteEmailMiddleware } from '../middleware/collaborators/send-collaborator-invite-email.middleware';
import { makeNotifyCollaboratorInvite } from '../middleware/notifications/notify-collaborator-invite.middleware';
import { makeNotifyCollaboratorAccepted } from '../middleware/notifications/notify-collaborator-accepted.middleware';
import { buildTripResponse } from '../middleware/trips/build-trip-response.middleware';
import { generateItinerary } from '../middleware/trips/generate-itinerary.middleware';
import { prepareOwnedClone } from '../middleware/trips/prepare-owned-clone.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { respond } from '../middleware/respond.middleware';
import { logCtaEvent } from '../lib/log-event';
import { Request } from 'express';

// Wraps a middleware so it is skipped when the trip has already been exported.
function skipIfExported(fn: RequestHandler): RequestHandler {
  return (req, res, next) => req.trip?.itineraryExportedAt ? next() : fn(req, res, next);
}

// Per-user key (limiters run after requireAuth) — same helper as notifications.routes.ts.
const byUser = (req: Request): string => req.user?.userId ?? req.ip ?? 'unknown';

export function createTripsRouter(
  trip: TripController,
  karma: KarmaController,
  collaborator: CollaboratorController,
  collaboratorRepo: ICollaboratorRepository,
  userRepo: IUserRepository,
  tripRepo: ITripRepository,
  notificationRepo: INotificationRepository,
): Router {
  const router = Router();

  router.use(requireAuth);

  const checkTripEditAccess = makeCheckTripEditAccess(collaboratorRepo);

  router.get('/',
    trip.findByOwner,
    makeAttachCollaboratorTrips(tripRepo, collaboratorRepo),
    respond(200),
  );

  router.get('/invites',
    collaborator.listPendingForUser,
    respond(200),
  );

  router.post('/',
    validateBody(createTripSchema),
    karma.requireForTrip,
    trip.create,
    karma.spend,
    buildTripResponse,
    respond(201),
  );

  router.post('/:id/itinerary',
    trip.findById,
    checkTripOwnership,
    skipIfExported(karma.requireForTrip),
    skipIfExported(karma.spend),
    skipIfExported(trip.recordExport),
    generateItinerary,
  );

  router.put('/:id',
    trip.findById,
    checkTripEditAccess,
    trip.update,
    buildTripResponse,
    respond(200),
  );

  router.delete('/:id',
    trip.findById,
    checkTripOwnership,
    trip.delete,
    respond(204),
  );

  router.post('/:id/share',
    trip.findById,
    checkTripOwnership,
    trip.shareIfAlreadyShared,
    trip.createShare,
    logCtaEvent('cta_trip_share', req => ({ tripId: req.params.id })),
    respond(200),
  );

  router.post('/:id/clone',
    trip.findById,
    checkTripOwnership,
    prepareOwnedClone,
    karma.requireForTrip,
    trip.create,
    karma.spend,
    buildTripResponse,
    logCtaEvent('cta_trip_clone', req => ({ sourceTripId: req.params.id, newTripId: (req.result as { id?: string } | undefined)?.id })),
    respond(201),
  );

  router.post('/:id/collaborators',
    rateLimitMiddleware({ keyPrefix: 'rl:collaborator-invite', windowSeconds: 3600, maxRequests: 10, getKey: byUser }),
    validateBody(inviteCollaboratorSchema),
    trip.findById,
    checkTripOwnership,
    makeResolveInvitee(userRepo),
    makeCheckInviteTarget(collaboratorRepo),
    karma.requireForCollaboratorInvite,
    collaborator.invite,
    karma.spendForCollaboratorInvite,
    makeNotifyCollaboratorInvite(notificationRepo),
    sendCollaboratorInviteEmailMiddleware,
    logCtaEvent('cta_collaborator_invite', req => ({ tripId: req.params.id, invitedEmail: req.invitedUser!.email })),
    respond(201),
  );

  router.post('/:id/collaborators/accept',
    trip.findById,
    collaborator.accept,
    requireAcceptedInvite,
    makeNotifyCollaboratorAccepted(notificationRepo),
    logCtaEvent('cta_collaborator_accept', req => ({ tripId: req.params.id })),
    respond(200),
  );

  router.delete('/:id/collaborators/:userId',
    trip.findById,
    checkTripOwnership,
    collaborator.remove,
    respond(204),
  );

  router.get('/:id/collaborators',
    trip.findById,
    checkTripEditAccess,
    collaborator.listForTrip,
    respond(200),
  );

  return router;
}
