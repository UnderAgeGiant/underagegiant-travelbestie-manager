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

export function createAuthRouter(user: UserController): Router {
  const router = Router();

  router.post('/register',
    decryptPayloadMiddleware,
    validate({ name: { required: true, minLength: 1 }, email: { required: true, minLength: 3 }, password: { required: true, minLength: 6 } }),
    user.findByEmail,
    checkEmailAvailable,
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

  return router;
}
