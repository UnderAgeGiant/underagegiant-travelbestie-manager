const DEV_JWT_DEFAULT = 'dev-secret-change-in-production';

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

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

  // A missing/local FRONTEND_ORIGIN silently breaks MercadoPago's post-payment redirect:
  // src/lib/mercadopago.ts's createMpPreference() builds back_urls from this value and only
  // sends auto_return when the origin isn't local — so a missing/local value in production
  // means MercadoPago never auto-redirects the browser back to the app after a real payment,
  // and instead shows its own "return to site" link pointing at an unreachable localhost URL.
  // See docs/superpowers/plans/2026-09-14-designer-feedback-round.md Task 1 for the full
  // root-cause writeup (feedback item #1: "payment doesn't return to Tripilove").
  const rawOrigin = process.env.FRONTEND_ORIGIN;
  if (!rawOrigin || rawOrigin.trim() === '') {
    throw new Error(
      'FATAL: FRONTEND_ORIGIN must be set to the real production frontend URL (not localhost) so MercadoPago can redirect back to the app.',
    );
  }
  const firstOrigin = rawOrigin.includes(',') ? rawOrigin.split(',')[0].trim() : rawOrigin;
  try {
    const { hostname } = new URL(firstOrigin);
    if (isLocalHostname(hostname)) {
      throw new Error(
        `FATAL: FRONTEND_ORIGIN resolves to a local hostname ("${firstOrigin}") in production — MercadoPago cannot redirect back to a local URL. Set it to the real production frontend URL.`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('FATAL:')) throw err;
    throw new Error(`FATAL: FRONTEND_ORIGIN ("${firstOrigin}") is not a valid URL.`);
  }
}
