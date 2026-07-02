const DEV_JWT_DEFAULT = 'dev-secret-change-in-production';

/** Throw at startup if required auth secrets are missing or insecure in production.
 *  No-op outside production so local/test runs keep working with dev defaults. */
export function validateProductionSecrets(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const jwt = process.env.JWT_SECRET;
  if (!jwt || jwt === DEV_JWT_DEFAULT) {
    throw new Error('FATAL: JWT_SECRET must be set to a strong unique value in production.');
  }

  const rsa = process.env.RSA_PRIVATE_KEY;
  if (!rsa || rsa.trim() === '') {
    throw new Error('FATAL: RSA_PRIVATE_KEY must be set in production to decrypt credentials.');
  }
}
