// Run locally: node scripts/generate-secrets.mjs
// Prints one new strong admin password and the three server env values.
import { randomBytes, scryptSync } from 'node:crypto';
const password = randomBytes(24).toString('base64url');
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
console.log('Save the admin password in a password manager. Do not commit it.');
console.log('NEW ADMIN PASSWORD (share privately only):', password);
console.log('\nVercel environment variables:');
console.log('ADMIN_PASSWORD_HASH=' + salt.toString('hex') + ':' + hash.toString('hex'));
console.log('SESSION_SECRET=' + randomBytes(32).toString('hex'));
console.log('RATE_LIMIT_SECRET=' + randomBytes(32).toString('hex'));
