import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { decryptPayloadMiddleware } from '../middleware/auth/decrypt-payload.middleware';
import { validateBody } from '../middleware/validate-body.middleware';
import {
  requestOtpSchema, registerSchema, loginSchema, requestProfileOtpSchema,
  requestPasswordResetSchema, resetPasswordSchema, profileSchema,
} from '../schemas/auth.schemas';
import { checkEmailAvailable } from '../middleware/auth/check-email-available.middleware';
import { hashPasswordMiddleware } from '../middleware/auth/hash-password.middleware';
import { verifyPasswordMiddleware } from '../middleware/auth/verify-password.middleware';
import { signTokenMiddleware } from '../middleware/auth/sign-token.middleware';
import { sendWelcomeEmailMiddleware } from '../middleware/auth/send-welcome-email.middleware';
import { respond } from '../middleware/respond.middleware';
import { rateLimitMiddleware }   from '../middleware/rate-limit.middleware';
import { generateOtpMiddleware } from '../middleware/auth/generate-otp.middleware';
import { verifyOtpMiddleware }   from '../middleware/auth/verify-otp.middleware';
import { requireAuth }                     from '../middleware/auth/require-auth.middleware';
import { verifyCurrentPasswordMiddleware } from '../middleware/auth/verify-current-password.middleware';
import { hashNewPasswordMiddleware }       from '../middleware/auth/hash-new-password.middleware';
import { checkNewEmailTaken }              from '../middleware/auth/check-new-email-taken.middleware';
import { generateProfileOtpMiddleware }    from '../middleware/auth/generate-profile-otp.middleware';
import { verifyProfileOtpMiddleware }      from '../middleware/auth/verify-profile-otp.middleware';
import { generateResetOtpMiddleware }      from '../middleware/auth/generate-reset-otp.middleware';
import { verifyResetOtpMiddleware }        from '../middleware/auth/verify-reset-otp.middleware';
import { logCtaEvent }                     from '../lib/log-event';
import { validateRefreshTokenMiddleware }  from '../middleware/auth/validate-refresh-token.middleware';
import { signRefreshedTokenMiddleware }    from '../middleware/auth/sign-refreshed-token.middleware';
import { revokeRefreshTokenMiddleware }    from '../middleware/auth/revoke-refresh-token.middleware';
import { invalidateSessionsMiddleware }    from '../middleware/auth/invalidate-sessions.middleware';

export function createAuthRouter(user: UserController): Router {
  const router = Router();

  router.post('/request-otp',
    rateLimitMiddleware({ keyPrefix: 'rl:req-otp', windowSeconds: 900, maxRequests: 5 }),
    validateBody(requestOtpSchema),
    user.findByEmail,
    checkEmailAvailable,
    generateOtpMiddleware,
    respond(200)
  );

  router.post('/register',
    rateLimitMiddleware({ keyPrefix: 'rl:register', windowSeconds: 900, maxRequests: 10 }),
    decryptPayloadMiddleware,
    validateBody(registerSchema),
    user.findByEmail,
    checkEmailAvailable,
    verifyOtpMiddleware,
    hashPasswordMiddleware,
    user.create,
    sendWelcomeEmailMiddleware,
    signTokenMiddleware,
    logCtaEvent('cta_register', req => ({ email: req.foundUser?.email })),
    respond(201)
  );

  router.post('/login',
    decryptPayloadMiddleware,
    validateBody(loginSchema),
    rateLimitMiddleware({
      keyPrefix: 'rl:login',
      windowSeconds: 900,
      maxRequests: 10,
      getKey: req => `${req.ip ?? 'unknown'}:${String(req.body.email ?? '').toLowerCase()}`,
    }),
    user.findByEmail,
    verifyPasswordMiddleware,
    signTokenMiddleware,
    logCtaEvent('cta_login', req => ({ email: req.foundUser?.email })),
    respond(200)
  );

  router.post('/refresh',
    validateRefreshTokenMiddleware,
    user.findByRefreshUser,
    signRefreshedTokenMiddleware,
    respond(200),
  );

  router.post('/logout',
    requireAuth,
    revokeRefreshTokenMiddleware,
    respond(204),
  );

  router.post('/request-profile-otp',
    requireAuth,
    rateLimitMiddleware({ keyPrefix: 'rl:profile-otp', windowSeconds: 900, maxRequests: 5 }),
    validateBody(requestProfileOtpSchema),
    user.findByNewEmail,
    checkNewEmailTaken,
    generateProfileOtpMiddleware,
    respond(200),
  );

  router.post('/request-password-reset',
    rateLimitMiddleware({ keyPrefix: 'rl:reset-otp', windowSeconds: 900, maxRequests: 5 }),
    validateBody(requestPasswordResetSchema),
    user.findByEmail,
    generateResetOtpMiddleware,
    respond(200),
  );

  router.post('/reset-password',
    decryptPayloadMiddleware,
    validateBody(resetPasswordSchema),
    user.findByEmail,
    verifyResetOtpMiddleware,
    hashNewPasswordMiddleware,
    user.resetPassword,
    invalidateSessionsMiddleware,
    logCtaEvent('cta_password_reset', req => ({ email: req.body.email })),
    respond(200),
  );

  router.put('/profile',
    requireAuth,
    decryptPayloadMiddleware,
    validateBody(profileSchema),
    user.findById,
    verifyCurrentPasswordMiddleware,
    hashNewPasswordMiddleware,
    user.findByNewEmail,
    checkNewEmailTaken,
    verifyProfileOtpMiddleware,
    user.update,
    invalidateSessionsMiddleware,
    respond(200),
  );

  return router;
}
