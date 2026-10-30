// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  hashPassword, bcryptHash, verifyPassword, needsRehash, PASSWORD_MIN_LENGTH,
} from './password.mjs';

// A known-good scrypt fixture from BEFORE the bcrypt migration, so the
// legacy verify path (and needsRehash) can be exercised even though
// hashPassword no longer produces this format. Generated with the original
// scrypt$N$r$p$salt$hash encoding (N=16384, r=8, p=1) for the password
// 'CorrectHorseBatteryStaple1' with a fixed 16-byte salt
// ('0123456789abcdef' as bytes, base64 below) — reproducible via:
//   crypto.scryptSync('CorrectHorseBatteryStaple1', salt, 32, { N:16384, r:8, p:1, maxmem: 256*16384*8 })
const LEGACY_SCRYPT_PASSWORD = 'CorrectHorseBatteryStaple1';
const LEGACY_SCRYPT_HASH =
  'scrypt$16384$8$1$MDEyMzQ1Njc4OWFiY2RlZg==$fUCqQOKn4iaBDlnKPDdUFvB0qY47PKDA6KNJT0JiMkQ=';

describe('hashPassword', () => {
  it('never stores the password in the encoded output', async () => {
    const encoded = await hashPassword('correct horse battery staple');
    expect(encoded).not.toContain('correct');
    expect(encoded).not.toContain('staple');
  });

  it('salts, so the same password hashes differently every time', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });

  it('produces a bcrypt(12)-encoded hash, self-describing via a prefix', async () => {
    const encoded = await hashPassword('whatever-long-enough');
    expect(encoded.startsWith('bcrypt$')).toBe(true);
    // bcryptjs embeds its own cost in the modular-crypt payload after the
    // prefix, e.g. bcrypt$$2b$12$<22-char-salt><31-char-hash>.
    expect(encoded.slice('bcrypt$'.length)).toMatch(/^\$2[aby]\$12\$/);
  });

  it('rejects a password shorter than the documented minimum', async () => {
    await expect(hashPassword('short')).rejects.toThrow(/at least/i);
  });

  it('enforces the 12-character boundary exactly: 11 chars rejected, 12 accepted', async () => {
    await expect(hashPassword('a'.repeat(11))).rejects.toThrow(/at least/i);
    await expect(hashPassword('a'.repeat(12))).resolves.toMatch(/^bcrypt\$/);
  });

  it('rejects a non-string password rather than hashing "undefined"', async () => {
    await expect(hashPassword(undefined)).rejects.toThrow();
    await expect(hashPassword(null)).rejects.toThrow();
  });
});

describe('bcryptHash', () => {
  it('encodes below the PASSWORD_MIN_LENGTH floor (rehash-on-login must work for legacy short passwords)', async () => {
    const shortLegacyPassword = 'a'.repeat(11); // valid under the OLD minimum of 10, invalid under today's 12
    expect(shortLegacyPassword.length).toBeLessThan(PASSWORD_MIN_LENGTH);
    await expect(bcryptHash(shortLegacyPassword)).resolves.toMatch(/^bcrypt\$\$2[aby]\$12\$/);
  });

  it('still rejects a non-string password', async () => {
    await expect(bcryptHash(undefined)).rejects.toThrow();
    await expect(bcryptHash(null)).rejects.toThrow();
  });

  it('produces a hash verifyPassword accepts', async () => {
    const encoded = await bcryptHash('a'.repeat(11));
    expect(await verifyPassword('a'.repeat(11), encoded)).toBe(true);
  });
});

describe('verifyPassword', () => {
  it('accepts the password it was derived from', async () => {
    const encoded = await hashPassword('s3cure-enough-password');
    expect(await verifyPassword('s3cure-enough-password', encoded)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const encoded = await hashPassword('s3cure-enough-password');
    expect(await verifyPassword('s3cure-enough-passwerd', encoded)).toBe(false);
  });

  it('rejects rather than throwing when the stored hash is malformed', async () => {
    // A corrupted or legacy row must fail closed, not 500 the login route.
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything', '')).toBe(false);
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$16384$8$1$onlyfivefields')).toBe(false);
  });

  it('rejects an empty candidate against a real hash', async () => {
    const encoded = await hashPassword('s3cure-enough-password');
    expect(await verifyPassword('', encoded)).toBe(false);
  });

  it('is case sensitive', async () => {
    const encoded = await hashPassword('CaseSensitivePassword');
    expect(await verifyPassword('casesensitivepassword', encoded)).toBe(false);
  });

  it('exposes a minimum length the sign-up path can quote to users', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
  });

  it('still verifies a legacy scrypt$-encoded hash (pre-migration rows must keep working)', async () => {
    expect(await verifyPassword(LEGACY_SCRYPT_PASSWORD, LEGACY_SCRYPT_HASH)).toBe(true);
  });

  it('rejects a wrong password against a legacy scrypt$ hash', async () => {
    expect(await verifyPassword('wrong-password-entirely', LEGACY_SCRYPT_HASH)).toBe(false);
  });
});

describe('needsRehash', () => {
  it('is true for a legacy scrypt$-encoded hash', () => {
    expect(needsRehash(LEGACY_SCRYPT_HASH)).toBe(true);
  });

  it('is false for a current bcrypt$-encoded hash', async () => {
    const encoded = await hashPassword('whatever-long-enough');
    expect(needsRehash(encoded)).toBe(false);
  });

  it('never throws on malformed or missing input', () => {
    expect(() => needsRehash('not-a-hash')).not.toThrow();
    expect(() => needsRehash(null)).not.toThrow();
    expect(() => needsRehash(undefined)).not.toThrow();
  });
});
