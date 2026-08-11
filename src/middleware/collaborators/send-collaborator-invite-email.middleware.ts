import { Request, Response, NextFunction } from 'express';
import { waitUntil } from '@vercel/functions';
import { sendCollaboratorInviteEmail } from '../../lib/email';
import { logger } from '../../lib/logger';

export const sendCollaboratorInviteEmailMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const invitee = req.invitedUser;
  const inviterName = req.user?.name;
  const tripTitle = req.trip?.title;
  if (invitee && inviterName && tripTitle) {
    waitUntil(
      sendCollaboratorInviteEmail(invitee.email, inviterName, tripTitle).catch((err: Error) =>
        logger.error({ msg: 'collaborator invite email failed', email: invitee.email, err: err.message })
      )
    );
  }
  next();
};
