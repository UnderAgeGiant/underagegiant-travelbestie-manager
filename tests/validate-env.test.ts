import { validateProductionSecrets } from '../src/lib/validate-env';

describe('validateProductionSecrets (B-5)', () => {
  const OLD = { ...process.env };
  afterEach(() => { process.env = { ...OLD }; });

  it('does nothing outside production', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.JWT_SECRET;
    expect(() => validateProductionSecrets()).not.toThrow();
  });

  it('throws in production when JWT_SECRET is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    process.env.RSA_PRIVATE_KEY = 'x';
    expect(() => validateProductionSecrets()).toThrow(/JWT_SECRET/);
  });

  it('throws in production when JWT_SECRET equals the dev default', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'dev-secret-change-in-production';
    process.env.RSA_PRIVATE_KEY = 'x';
    expect(() => validateProductionSecrets()).toThrow(/JWT_SECRET/);
  });

  it('throws in production when RSA_PRIVATE_KEY is missing', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-strong-unique-secret-value';
    delete process.env.RSA_PRIVATE_KEY;
    expect(() => validateProductionSecrets()).toThrow(/RSA_PRIVATE_KEY/);
  });

  it('passes in production with strong secrets set', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-strong-unique-secret-value';
    process.env.RSA_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----...';
    process.env.FRONTEND_ORIGIN = 'https://tripilove.com';
    expect(() => validateProductionSecrets()).not.toThrow();
  });

  it('throws in production when FRONTEND_ORIGIN is not set', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-strong-unique-secret';
    process.env.RSA_PRIVATE_KEY = 'some-key';
    delete process.env.FRONTEND_ORIGIN;

    expect(() => validateProductionSecrets()).toThrow(
      'FATAL: FRONTEND_ORIGIN must be set to the real production frontend URL (not localhost) so MercadoPago can redirect back to the app.',
    );
  });

  it('throws in production when FRONTEND_ORIGIN resolves to a local hostname', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-strong-unique-secret';
    process.env.RSA_PRIVATE_KEY = 'some-key';
    process.env.FRONTEND_ORIGIN = 'http://localhost:4200';

    expect(() => validateProductionSecrets()).toThrow(/FRONTEND_ORIGIN/);
  });

  it('does not throw in production when FRONTEND_ORIGIN is a real HTTPS domain', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-strong-unique-secret';
    process.env.RSA_PRIVATE_KEY = 'some-key';
    process.env.FRONTEND_ORIGIN = 'https://tripilove.com';

    expect(() => validateProductionSecrets()).not.toThrow();
  });

  it('does not throw in production when FRONTEND_ORIGIN has multiple comma-separated origins and the first is real', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-strong-unique-secret';
    process.env.RSA_PRIVATE_KEY = 'some-key';
    process.env.FRONTEND_ORIGIN = 'https://tripilove.com,https://www.tripilove.com';

    expect(() => validateProductionSecrets()).not.toThrow();
  });
});
