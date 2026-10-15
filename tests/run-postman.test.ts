import { generateKeyPairSync, privateDecrypt, constants } from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildAuthBody, buildBodies, newmanUsername } = require('../scripts/run-postman.cjs');

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const decrypt = (b64: string) => JSON.parse(privateDecrypt(
  { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
  Buffer.from(b64, 'base64'),
).toString());

describe('buildAuthBody', () => {
  it('returns plain JSON when no private key (backend without RSA_PRIVATE_KEY)', () => {
    expect(JSON.parse(buildAuthBody('a@b.c', 'pw', ''))).toEqual({ email: 'a@b.c', password: 'pw' });
  });
  it('returns an OAEP-SHA256 payload the backend can decrypt', () => {
    const { encryptedPayload } = JSON.parse(buildAuthBody('a@b.c', 'pw', privateKey));
    expect(decrypt(encryptedPayload)).toEqual({ email: 'a@b.c', password: 'pw' });
  });
  it('accepts a local.env-style key with literal \n escapes', () => {
    const { encryptedPayload } = JSON.parse(buildAuthBody('a@b.c', 'pw', privateKey.replace(/\n/g, '\n')));
    expect(decrypt(encryptedPayload)).toEqual({ email: 'a@b.c', password: 'pw' });
  });
});

describe('buildBodies', () => {
  const vals = { testUserEmail: 'm@x.c', testUserPassword: 'mpw', collabUserEmail: 'c@x.c', collabUserPassword: 'cpw' };
  it('builds every named body the collection reads, main and collab logins included', () => {
    const b = buildBodies(vals, '');
    expect(JSON.parse(b.login)).toEqual({ email: 'm@x.c', password: 'mpw' });
    expect(JSON.parse(b.collabLogin)).toEqual({ email: 'c@x.c', password: 'cpw' });
    for (const v of Object.values(b)) expect(() => JSON.parse(v as string)).not.toThrow();
  });
});

describe('newmanUsername', () => {
  it('is deterministic, case-insensitive and matches the username format (§16.5)', () => {
    expect(newmanUsername('A@B.c')).toBe(newmanUsername('a@b.c'));
    expect(newmanUsername('a@b.c')).toMatch(/^nm[0-9a-f]{10}$/);
    expect(newmanUsername('a@b.c')).not.toBe(newmanUsername('c@b.c'));
  });
  it('profile bodies carry the derived usernames', () => {
    const b = buildBodies({ testUserEmail: 'm@x.c', collabUserEmail: 'c@x.c' }, '');
    expect(JSON.parse(b.profileName).username).toBe(newmanUsername('m@x.c'));
    expect(JSON.parse(b.collabProfile)).toEqual({ username: newmanUsername('c@x.c') });
  });
});
