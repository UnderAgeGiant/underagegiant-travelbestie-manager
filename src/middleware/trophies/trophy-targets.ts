import { Request } from 'express';
import { TrophyTarget, TrophyTargetFn } from './record-trophy.middleware';
import { FavoriteToggleResult, SharedTripPayload, StepComment } from '../../types';

/** Step comment on someone else's shared plan → the commenter. */
export const commentTarget: TrophyTargetFn = (req: Request): TrophyTarget => {
  const meta = req.sharedTripMeta;
  const comment = (req.result as { comment?: StepComment } | undefined)?.comment;
  if (!meta || !comment || !req.user || req.user.userId === meta.ownerId) return null;
  return { userId: req.user.userId, refId: comment.id, celebrate: true };
};

/** Favorite (not unfavorite) by someone else → the owner; ref dedupes toggling, scope = plan. */
export const favoriteTarget: TrophyTargetFn = (req: Request): TrophyTarget => {
  const meta = req.sharedTripMeta;
  const result = req.result as FavoriteToggleResult | undefined;
  if (!meta || !result?.favorited || !req.user || req.user.userId === meta.ownerId) return null;
  return { userId: meta.ownerId, refId: `${meta.tripId}:${req.user.userId}`, scopeId: meta.tripId, celebrate: false };
};

/** Clone of a shared plan by someone else → the owner; ref = the new trip id. */
export const cloneTarget: TrophyTargetFn = (req: Request): TrophyTarget => {
  const meta = req.sharedTripMeta;
  const newId = (req.result as { id?: string } | undefined)?.id;
  if (!meta || !newId || !req.user || req.user.userId === meta.ownerId) return null;
  return { userId: meta.ownerId, refId: newId, celebrate: false };
};

/** Logged-in non-owner opens a published plan → the owner (skipped once they hold it). */
export const visitTarget: TrophyTargetFn = async (req, recorder): Promise<TrophyTarget> => {
  const ownerId = (req.result as SharedTripPayload | undefined)?.ownerId;
  if (!ownerId || !req.user || req.user.userId === ownerId) return null;
  if (await recorder.has(ownerId, 'plan_visited')) return null;
  return { userId: ownerId, refId: req.user.userId, celebrate: false };
};

/** Itinerary export → the owner (only the owner can export). */
export const exportTarget: TrophyTargetFn = (req: Request): TrophyTarget =>
  req.user && req.trip ? { userId: req.user.userId, refId: req.trip.id, celebrate: true } : null;

/** First publish of a trip → the owner. */
export const publishTarget: TrophyTargetFn = (req: Request): TrophyTarget =>
  req.user ? { userId: req.user.userId, refId: req.params.id, celebrate: true } : null;

/** Completed client-side share (POST /trophies/share/:shareId) → the caller. */
export const shareTarget: TrophyTargetFn = (req: Request): TrophyTarget =>
  req.user ? { userId: req.user.userId, refId: req.params.shareId, celebrate: true } : null;
