// Per-account login lockout.
//
// A password-guessing attacker who already knows (or is enumerating) an
// email address can otherwise retry forever. This caps that: five verified
// bad passwords in a row locks the account for fifteen minutes, tracked
// entirely in eworks.user_profiles (failed_attempts, locked_until) so it
// works the same whether the BFF is one process or many behind a pool.
//
// isLocked/recordFailure/clearFailures speak the same camelCase shape the
// rest of the JS layer uses for user rows (see auth.mjs#findUserByEmail),
// not the raw snake_case column names — callers never need to know the
// underlying column names.

export const MAX_FAILED = 5;
export const LOCK_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Pure predicate: is this user's account currently locked?
 *
 * Takes `now` as a parameter (defaulting to Date.now()) so tests can pin
 * time instead of racing the clock.
 */
export function isLocked(user, now = Date.now()) {
  if (!user?.lockedUntil) return false;
  return new Date(user.lockedUntil).getTime() > now;
}

/**
 * Record a verified-bad password attempt. Increments failed_attempts and,
 * only on the attempt that reaches MAX_FAILED, sets locked_until to now +
 * LOCK_MS. Below the threshold locked_until is left untouched (so a lock
 * already in force isn't shortened, and no lock is set early).
 *
 * Returns the post-update { failedAttempts, lockedUntil } (or null if the
 * user id doesn't exist), so the caller can tell whether this attempt is the
 * one that just crossed the threshold and audit-log accordingly.
 */
export async function recordFailure(pool, userId, now = Date.now()) {
  const { rows } = await pool.query(
    `update eworks.user_profiles
        set failed_attempts = failed_attempts + 1,
            locked_until = case when failed_attempts + 1 >= $2
                                then to_timestamp($3 / 1000.0) else locked_until end
      where id = $1
      returning failed_attempts as "failedAttempts", locked_until as "lockedUntil"`,
    [userId, MAX_FAILED, now + LOCK_MS],
  );
  return rows[0] ?? null;
}

/** Zero the failure counter and clear any lock after a successful login. */
export async function clearFailures(pool, userId) {
  await pool.query(
    `update eworks.user_profiles set failed_attempts = 0, locked_until = null where id = $1`,
    [userId],
  );
}
