const { generateKeyPairSync } = require('crypto');
const { writeFileSync } = require('fs');
const { resolve } = require('path');

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 4096,
  publicKeyEncoding:  { type: 'spki',  format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Collapse PEM to a single line with literal \n for dotenv
const envLine = 'RSA_PRIVATE_KEY=' + privateKey.replace(/\n/g, String.raw`\n`);

// SPKI DER base64 for Postman rsaPublicKeyBase64
const pubBase64 = publicKey.toString('base64');

writeFileSync(resolve(__dirname, '../private.pem'), privateKey, 'utf8');

console.log('========== 1. Add to local.env ==========');
console.log(envLine);
console.log('');
console.log('========== 2. Postman rsaPublicKeyBase64 ==========');
console.log(pubBase64);
console.log('');
console.log('private.pem written next to this script for reference — do NOT commit it.');
