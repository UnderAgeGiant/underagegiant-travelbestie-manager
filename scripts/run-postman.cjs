#!/usr/bin/env node
// Runs the Postman collection with Newman. Newman's sandbox has no WebCrypto, so every
// RSA-encrypted body the collection sends is precomputed here (public half of local.env's
// RSA_PRIVATE_KEY) and handed over as one env value, `nmBodies` (a JSON map name → body).
//   node scripts/run-postman.cjs [--folder <name>]...   run (default: every folder but Costly)
//   node scripts/run-postman.cjs --print-auth-body      print the main login body (k6)
const { readFileSync, writeFileSync, existsSync, rmSync } = require('node:fs');
const { createPublicKey, publicEncrypt, constants, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

function encryptBody(payload, privateKeyPem) {
  const json = JSON.stringify(payload);
  if (!privateKeyPem) return json; // backend without RSA_PRIVATE_KEY accepts plain JSON
  const pub = createPublicKey(privateKeyPem.replace(/\\n/g, '\n'));
  const enc = publicEncrypt({ key: pub, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(json));
  return JSON.stringify({ encryptedPayload: enc.toString('base64') });
}

function buildAuthBody(email, password, privateKeyPem) {
  return encryptBody({ email, password }, privateKeyPem);
}

// Deterministic test username per account; the collection derives the same value with CryptoJS.
function newmanUsername(email) {
  return 'nm' + createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 10);
}

// Keep in sync with the collection's pre-request scripts (same names, same payloads).
function buildBodies(v, key) {
  const p = {
    login: { email: v.testUserEmail, password: v.testUserPassword },
    collabLogin: { email: v.collabUserEmail, password: v.collabUserPassword },
    loginWrongPassword: { email: v.testUserEmail, password: 'definitelywrong' },
    loginUnknownEmail: { email: 'nobody@nonexistent.com', password: 'doesnotmatter' },
    registerExisting: { name: 'Newman', email: v.testUserEmail, password: 'testpass123', otp: '000000' },
    registerShortPassword: { name: 'Test', email: 'short.pass@travelbestie.com', password: '123', otp: '000000' },
    registerMissingName: { email: 'no.name@travelbestie.com', password: 'testpass123', otp: '000000' },
    resetWrongOtp: { email: 'nobody@nonexistent.com', otp: '000000', newPassword: 'testpass123' },
    profileName: { name: 'Newman Test', username: newmanUsername(v.testUserEmail) },
    collabProfile: { username: newmanUsername(v.collabUserEmail) },
  };
  return Object.fromEntries(Object.entries(p).map(([k, payload]) => [k, encryptBody(payload, key)]));
}

// Default run = every folder except '💸 Costly (manual)'. Newman runs selected folders in COLLECTION order,
// so the collection's top-level folders are arranged in this same order (Cleanup last).
const DEFAULT_FOLDERS = ['🏥 Health', '🔐 Auth', '🗺️ Trips', '🤝 Collaborators', '🌍 Shared Trips',
  '💬 Comments', '💬 Step Comments', '⭐ Karma', '🤖 AI', '🔔 Notifications', '✨ Highlights',
  '🏆 Trophies & Rankings', '🌦️ Weather', '🔎 SEO', '🏠 Landing & Feed', '👥 Social', '🐝 Companion',
  '❤️ Favorites', '🧹 Cleanup'];

// Pinned: the spawned Newman receives both test accounts' credentials, so never run "latest".
const NEWMAN = 'newman@6.2.2';

function main() {
  const root = path.dirname(__dirname);
  const envFile = path.join(root, 'travelbestie-local.postman_environment.json');
  if (!existsSync(envFile)) {
    console.error('Missing travelbestie-local.postman_environment.json — copy the .example and fill in both test accounts.');
    process.exit(1);
  }
  require('dotenv').config({ path: path.join(root, 'local.env'), quiet: true });
  const env = JSON.parse(readFileSync(envFile, 'utf8'));
  const vals = Object.fromEntries(env.values.map(v => [v.key, v.value]));
  const key = process.env.RSA_PRIVATE_KEY ?? '';
  if (process.argv.includes('--print-auth-body')) {
    process.stdout.write(buildAuthBody(vals.testUserEmail, vals.testUserPassword, key));
    return;
  }

  // A temp env copy carries the bodies: passing JSON through --env-var gets mangled by the Windows shell.
  env.values = env.values.filter(v => v.key !== 'nmBodies')
    .concat({ key: 'nmBodies', value: JSON.stringify(buildBodies(vals, key)), enabled: true });
  const tmpEnv = path.join(os.tmpdir(), `travelbestie-newman-${process.pid}.postman_environment.json`);
  writeFileSync(tmpEnv, JSON.stringify(env));

  const passthrough = process.argv.slice(2);
  const folders = passthrough.length ? passthrough : DEFAULT_FOLDERS.flatMap(f => ['--folder', f]);
  const quote = a => (process.platform === 'win32' ? `"${a}"` : a); // shell:true on Windows splits on spaces
  const r = spawnSync('npx', ['--yes', NEWMAN, 'run', path.join(root, 'travelbestie-manager.postman_collection.json'),
    '-e', tmpEnv, ...folders].map(quote), { stdio: 'inherit', shell: process.platform === 'win32' });
  rmSync(tmpEnv, { force: true });
  process.exit(r.status ?? 1);
}

module.exports = { encryptBody, buildAuthBody, buildBodies, newmanUsername, DEFAULT_FOLDERS, NEWMAN };

if (require.main === module) main();
