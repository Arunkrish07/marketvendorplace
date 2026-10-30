// @vitest-environment node
//
// isLocked reads user.lockedUntil (camelCase), matching the shape
// findUserByEmail returns (see auth.mjs) rather than the raw
// eworks.user_profiles column name — kept consistent with every other
// aliased field on that row (passwordHash, isActive, ...).
import { describe, it, expect } from 'vitest';
import { isLocked, MAX_FAILED, LOCK_MS } from './lockout.mjs';

describe('isLocked', () => {
  const now = 1_000_000;
  it('is false with no lock', () => expect(isLocked({ lockedUntil: null }, now)).toBe(false));
  it('is true while locked', () => expect(isLocked({ lockedUntil: new Date(now + 1000).toISOString() }, now)).toBe(true));
  it('is false once the lock elapses', () => expect(isLocked({ lockedUntil: new Date(now - 1).toISOString() }, now)).toBe(false));
});

describe('constants', () => {
  it('MAX_FAILED is 5', () => expect(MAX_FAILED).toBe(5));
  it('LOCK_MS is 15 minutes', () => expect(LOCK_MS).toBe(15 * 60 * 1000));
});
