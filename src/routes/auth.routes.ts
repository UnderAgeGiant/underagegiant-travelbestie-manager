import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { decryptPayloadMiddleware } from '../middleware/auth/decrypt-payload.middleware';
import { validate } from '../middleware/validate.middleware';
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

export function createAuthRouter(user: UserController): Router {
  const router = Router();

  router.post('/request-otp',
    rateLimitMiddleware({ keyPrefix: 'rl:req-otp', windowSeconds: 900, maxRequests: 5 }),
    validate({ email: { required: true, minLength: 3 } }),
    user.findByEmail,
    checkEmailAvailable,
    generateOtpMiddleware,
    respond(200)
  );

  router.post('/register',
    rateLimitMiddleware({ keyPrefix: 'rl:register', windowSeconds: 900, maxRequests: 10 }),
    decryptPayloadMiddleware,
    validate({
      name:     { required: true, minLength: 1 },
      email:    { required: true, minLength: 3 },
      password: { required: true, minLength: 6 },
      otp:      { required: true, minLength: 6 },
    }),
    user.findByEmail,
    checkEmailAvailable,
    verifyOtpMiddleware,
    hashPasswordMiddleware,
    user.create,
    sendWelcomeEmailMiddleware,
    signTokenMiddleware,
    respond(201)
  );

  router.post('/login',
    decryptPayloadMiddleware,
    validate({ email: { required: true }, password: { required: true } }),
    user.findByEmail,
    verifyPasswordMiddleware,
    signTokenMiddleware,
    respond(200)
  );

  router.post('/request-profile-otp',
    requireAuth,
    rateLimitMiddleware({ keyPrefix: 'rl:profile-otp', windowSeconds: 900, maxRequests: 5 }),
    validate({ newEmail: { required: true, minLength: 3 } }),
    user.findByNewEmail,
    checkNewEmailTaken,
    generateProfileOtpMiddleware,
    respond(200),
  );

  router.put('/profile',
    requireAuth,
    decryptPayloadMiddleware,
    validate({
      name:            { minLength: 1 },
      newEmail:        { minLength: 3 },
      otp:             { minLength: 6 },
      currentPassword: { minLength: 1 },
      newPassword:     { minLength: 6 },
    }),
    user.findById,
    verifyCurrentPasswordMiddleware,
    hashNewPasswordMiddleware,
    user.findByNewEmail,
    checkNewEmailTaken,
    verifyProfileOtpMiddleware,
    user.update,
    respond(200),
  );

  return router;
}
