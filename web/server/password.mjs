// Password hashing for email + password sign-in.
//
// bcrypt (via bcryptjs, cost 12) is the current KDF. Every stored hash is
// self-describing via a leading `<algo>$` prefix, which is what makes
// migrations transparent: verifyPassword dispatches on the prefix, so a row
// hashed under an older scheme keeps verifying, and needsRehash tells the
// login route when to quietly re-hash it at the current scheme/cost.
//
// scrypt (node:crypto, memory-hard, no native dependency) was the original
// KDF here and is kept ONLY for verifying pre-migration rows — hashPassword
// never produces it anymore.

import crypto from 'node:crypto';
import { promisify } from 'node:util';
import bcrypt from 'bcryptjs';

const scrypt = promisify(crypto.scrypt);

/** bcrypt cost factor for all newly created hashes. */
const BCRYPT_COST = 12;

export const PASSWORD_MIN_LENGTH = 12;

/**
 * A real bcrypt hash of an unguessable random value, computed once at boot.
 *
 * The login route verifies against this when no account matches, so the
 * "no such email" path burns the same CPU as the "wrong password" path. Without
 * it, an attacker can tell registered addresses from unregistered ones by
 * response time alone, turning login into an account enumeration oracle.
 */
export const DUMMY_PASSWORD_HASH = `bcrypt$${bcrypt.hashSync(
  crypto.randomBytes(32).toString('hex'), BCRYPT_COST,
)}`;

/**
 * Core bcrypt encoding, deliberately WITHOUT the PASSWORD_MIN_LENGTH gate.
 *
 * Used both by hashPassword (new passwords, where the minimum is a real
 * input-validation rule) and by the login route's rehash-on-login (an
 * already-verified password from an existing account, where the minimum is
 * not applicable — a legacy account created under an older, shorter minimum
 * must still be able to migrate off scrypt, not get stuck forever because its
 * real password happens to be shorter than today's floor).
 */
export async function bcryptHash(password) {
  if (typeof password !== 'string') {
    throw new TypeError('password must be a string');
  }
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  return `bcrypt$${hash}`;
}

export async function hashPassword(password) {
  if (typeof password !== 'string') {
    throw new TypeError('password must be a string');
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  return bcryptHash(password);
}

async function verifyScrypt(candidate, encoded) {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt;
  let expected;
  try {
    salt = Buffer.from(saltB64, 'base64');
    expected = Buffer.from(hashB64, 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const actual = await scrypt(candidate, salt, expected.length, {
      N: n, r, p, maxmem: 256 * n * r,
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function verifyBcrypt(candidate, encoded) {
  const hash = encoded.slice('bcrypt$'.length);
  if (!hash) return false;
  try {
    return await bcrypt.compare(candidate, hash);
  } catch {
    return false;
  }
}

/**
 * Verify against either encoding. Returns false — never throws — for a
 * malformed or missing stored hash, so a corrupted row fails the login
 * closed rather than turning into a 500 that leaks which accounts have bad
 * data. bcrypt.compare is constant-time by construction; the scrypt path
 * keeps its explicit timingSafeEqual.
 */
export async function verifyPassword(candidate, encoded) {
  if (typeof candidate !== 'string' || typeof encoded !== 'string') return false;

  if (encoded.startsWith('bcrypt$')) return verifyBcrypt(candidate, encoded);
  if (encoded.startsWith('scrypt$')) return verifyScrypt(candidate, encoded);
  return false;
}

/**
 * True iff the stored hash is in a legacy (pre-bcrypt) encoding and should
 * be transparently replaced with a fresh bcrypt hash the next time the
 * plaintext password is available (i.e. right after a successful login).
 * Never throws, mirroring verifyPassword's fail-closed contract — malformed
 * or missing input is simply "not legacy scrypt", not an error.
 */
export function needsRehash(encoded) {
  return typeof encoded === 'string' && encoded.startsWith('scrypt$');
}
