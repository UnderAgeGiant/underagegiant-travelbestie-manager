import { privateDecrypt, constants } from 'crypto';

const privateKey = (process.env.RSA_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');

export function decryptPayload(encryptedBase64: string): Record<string, unknown> {
  const buf = Buffer.from(encryptedBase64, 'base64');
  const decrypted = privateDecrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    buf
  );
  return JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>;
}
