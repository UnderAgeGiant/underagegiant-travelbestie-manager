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
    expect(() => validateProductionSecrets()).not.toThrow();
  });
});
