import { privateDecrypt, createPrivateKey, constants } from 'crypto';

export function decryptPayload(encryptedBase64: string): Record<string, unknown> {
  const pem = (process.env.RSA_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  const keyObject = createPrivateKey(pem);
  const buf = Buffer.from(encryptedBase64, 'base64');
  const decrypted = privateDecrypt(
    { key: keyObject, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    buf
  );
  return JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>;
}
