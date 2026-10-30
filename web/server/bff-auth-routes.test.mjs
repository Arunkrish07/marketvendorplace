// @vitest-environment node
// Route-level contract for /api/auth/otp/send: what the browser is allowed to
// see. Demo codes appear ONLY in demo mode (never production), and the MFA
// step obeys MFA_ENABLED.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { loadConfig } from './env.mjs';
import { __resetChallenges } from './auth.mjs';
import { issueCaptcha } from './captcha.mjs';
import { MAX_FAILED } from './lockout.mjs';
import { DUMMY_PASSWORD_HASH, hashPassword } from './password.mjs';

// A stateful stub for the login-lockout tests: they need the same fake
// "user_profiles" row to survive across several requests (failed_attempts
// incrementing, locked_until getting set) rather than the stateless
// per-query stub the OTP tests use. Declared via vi.hoisted so it's safe to
// close over from inside the (hoisted) vi.mock factory below.
const state = vi.hoisted(() => ({ user: null, auditShouldFail: false }));

const pgQuery = vi.hoisted(() => vi.fn());

vi.mock('./db.mjs', () => ({
  pool: { query: pgQuery },
  withUserSession: vi.fn(),
  lookupProfile: vi.fn(),
}));

const { lookupProfile } = await import('./db.mjs');

pgQuery.mockImplementation(async (sql) => {
  // findUserByEmail (auth.mjs) — the login-lockout fixture row, when set.
  if (sql.includes('from eworks.user_profiles') && sql.includes('lower(email)')) {
    return state.user ? { rows: [{ ...state.user }] } : { rows: [] };
  }
  // recordFailure (lockout.mjs)
  if (sql.includes('update eworks.user_profiles') && sql.includes('failed_attempts = failed_attempts + 1')) {
    state.user.failedAttempts += 1;
    if (state.user.failedAttempts >= 5 && !state.user.lockedUntil) {
      state.user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }
    return { rows: [{ failedAttempts: state.user.failedAttempts, lockedUntil: state.user.lockedUntil }] };
  }
  // clearFailures (lockout.mjs)
  if (sql.includes('update eworks.user_profiles') && sql.includes('failed_attempts = 0')) {
    state.user.failedAttempts = 0;
    state.user.lockedUntil = null;
    return { rows: [], rowCount: 1 };
  }
  if (sql.includes('audit_logs')) {
    if (state.auditShouldFail) {
      throw new Error('simulated audit_logs insert failure (e.g. missing INSERT grant on the remote role)');
    }
    return { rows: [], rowCount: 1 };
  }
  // Generic fallbacks used by the OTP-send tests below.
  if (sql.includes('user_profiles')) return { rows: [{ id: 'gov-user-1' }] };
  if (sql.includes('user_roles')) return { rows: [{ role_code: 'HEAD_ADMIN' }] };
  return { rows: [], rowCount: 0 };
});

const { createApp } = await import('./bff.mjs');

function captureProvider() {
  const sent = [];
  return { sent, async send(m) { sent.push(m); return { delivered: true }; } };
}

async function postSend(config, provider) {
  const app = createApp(config, { provider });
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9944312345' }),
    });
    return await res.json();
  } finally {
    server.close();
  }
}

// Like postSend, but returns the status alongside the body — needed for the
// enumeration-parity check, which asserts on status too (404 vs 200 is
// itself part of the leak).
async function postSendFull(config, provider, phone = '9944312345') {
  const app = createApp(config, { provider });
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

const prodEnv = {
  EWORKS_ENV: 'production', OTP_PEPPER: 'p'.repeat(32),
  CORS_ORIGIN: 'https://getlegal.anvastech.in', SESSION_SECRET: 's'.repeat(32),
  EWORKS_USE_LOCAL_PG: '1',
};

beforeEach(() => __resetChallenges());

describe('otp send response contract', () => {
  it('demo mode returns demoOtp and demoMfa matching the delivered codes', async () => {
    const p = captureProvider();
    const body = await postSend(loadConfig({ DEMO_MODE: 'true' }), p);
    expect(body.sent).toBe(true);
    expect(body.requiresMfa).toBe(true); // HEAD_ADMIN
    expect(body.demoOtp).toBe(p.sent.find((m) => m.purpose === 'otp').code);
    expect(body.demoMfa).toBe(p.sent.find((m) => m.purpose === 'mfa').code);
  });

  it('PRODUCTION response never contains any delivered code, even with DEMO_MODE=true', async () => {
    const p = captureProvider();
    const body = await postSend(loadConfig({ ...prodEnv, DEMO_MODE: 'true' }), p);
    expect(body.sent).toBe(true);
    expect(body).not.toHaveProperty('demoOtp');
    expect(body).not.toHaveProperty('demoMfa');
    const raw = JSON.stringify(body);
    for (const m of p.sent) expect(raw).not.toContain(m.code);
  });

  it('normal (non-demo) dev response has no demo fields either', async () => {
    const body = await postSend(loadConfig({}), captureProvider());
    expect(body).not.toHaveProperty('demoOtp');
    expect(body).not.toHaveProperty('demoMfa');
  });

  it('MFA_ENABLED=false skips the MFA challenge even for government roles', async () => {
    const p = captureProvider();
    const body = await postSend(loadConfig({ ...prodEnv, MFA_ENABLED: 'false' }), p);
    expect(body.requiresMfa).toBe(false);
    expect(p.sent.map((m) => m.purpose)).toEqual(['otp']); // no mfa send
  });

  it('an unknown phone gets the byte-identical (production) response of a known vendor phone, and no SMS is sent', async () => {
    const config = loadConfig(prodEnv); // production: demoMode is hard-false here
    const phone = '9944312345';

    // Known vendor phone: findUserIdByPhone finds a user, userRequiresMfa
    // sees a vendor-only role set (MFA-exempt).
    pgQuery.mockImplementationOnce(async () => ({ rows: [{ id: 'vendor-user-1' }] }));
    pgQuery.mockImplementationOnce(async () => ({ rows: [{ role_code: 'LAB_VENDOR' }] }));
    const vendorProvider = captureProvider();
    const vendorRes = await postSendFull(config, vendorProvider, phone);

    // Unknown phone: findUserIdByPhone finds nothing.
    pgQuery.mockImplementationOnce(async () => ({ rows: [] }));
    const unknownProvider = captureProvider();
    const unknownRes = await postSendFull(config, unknownProvider, phone);

    expect(vendorRes.status).toBe(200);
    expect(unknownRes.status).toBe(vendorRes.status);
    expect(unknownRes.body).toEqual(vendorRes.body);
    expect(unknownRes.body).toEqual({ sent: true, maskedPhone: expect.any(String), requiresMfa: false });

    // Never issue/send a real challenge for a phone with no profile.
    expect(unknownProvider.sent).toEqual([]);
  });
});

describe('/api/auth/login lockout', () => {
  const LOGIN_EMAIL = 'lockme@example.com';

  beforeEach(() => {
    state.user = {
      id: 'lockout-user-1',
      email: LOGIN_EMAIL,
      phone: '9998887776',
      passwordHash: 'not-a-real-scrypt-hash', // verifyPassword rejects malformed hashes, never throws
      isActive: true,
      lockedUntil: null,
      failedAttempts: 0,
    };
    state.auditShouldFail = false;
    pgQuery.mockClear();
  });

  async function postLogin(config) {
    const app = createApp(config, { provider: captureProvider() });
    const server = app.listen(0);
    try {
      const { port } = server.address();
      // A fresh, valid captcha per request: captcha verification is checked
      // before credentials and must not be what's under test here.
      const { code, token } = issueCaptcha(config.sessionSecret);
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `eworks_captcha=${encodeURIComponent(token)}`,
        },
        body: JSON.stringify({ email: LOGIN_EMAIL, password: 'definitely-wrong', captcha: code }),
      });
      return { status: res.status, body: await res.json() };
    } finally {
      server.close();
    }
  }

  it('locks the account after 5 bad passwords, and the 6th attempt gets the same generic error', async () => {
    const config = loadConfig({ MFA_ENABLED: 'false', EWORKS_USE_LOCAL_PG: '1' });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await postLogin(config);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'invalid_credentials' });
    }

    expect(state.user.failedAttempts).toBe(5);
    expect(state.user.lockedUntil).toBeTruthy();

    const failuresRecorded = pgQuery.mock.calls.filter(
      ([sql]) => sql.includes('failed_attempts = failed_attempts + 1'),
    ).length;
    expect(failuresRecorded).toBe(5);

    // 6th attempt: same account, same wrong password — but now locked. Must
    // be indistinguishable from a plain wrong password.
    const sixth = await postLogin(config);
    expect(sixth.status).toBe(401);
    expect(sixth.body).toEqual({ error: 'invalid_credentials' });

    // The lock short-circuits before recordFailure runs again — the count
    // must not have moved past 5.
    const failuresAfterSixth = pgQuery.mock.calls.filter(
      ([sql]) => sql.includes('failed_attempts = failed_attempts + 1'),
    ).length;
    expect(failuresAfterSixth).toBe(5);
  });

  it('a failing audit-log write on the lock-crossing attempt never changes the response (no 500, no leaked detail)', async () => {
    const config = loadConfig({ MFA_ENABLED: 'false', EWORKS_USE_LOCAL_PG: '1' });
    // One failure short of the threshold, so this attempt is the one that
    // crosses MAX_FAILED and triggers the (here, failing) audit insert.
    state.user.failedAttempts = MAX_FAILED - 1;
    state.auditShouldFail = true;
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const res = await postLogin(config);

      // Still the plain, generic lockout response — never a 500, never the
      // audit error's message leaking into the body.
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'invalid_credentials' });
      expect(res.body).not.toHaveProperty('detail');

      // The lock itself must still have been persisted: a failing audit
      // write is not allowed to roll back or skip recordFailure.
      expect(state.user.failedAttempts).toBe(MAX_FAILED);
      expect(state.user.lockedUntil).toBeTruthy();

      // The failure was logged rather than silently dropped.
      expect(consoleErr).toHaveBeenCalled();
    } finally {
      consoleErr.mockRestore();
    }
  });
});

describe('/api/auth/login success — legacy scrypt rehash', () => {
  const LOGIN_EMAIL = 'rehash@example.com';
  // Same fixture documented in password.test.mjs: a real scrypt$-encoded
  // hash of this password, produced by the pre-bcrypt algorithm, kept
  // hard-coded so this test doesn't depend on hashPassword still being able
  // to produce scrypt output (it can't, post-migration).
  const LEGACY_PASSWORD = 'CorrectHorseBatteryStaple1';
  const LEGACY_HASH =
    'scrypt$16384$8$1$MDEyMzQ1Njc4OWFiY2RlZg==$fUCqQOKn4iaBDlnKPDdUFvB0qY47PKDA6KNJT0JiMkQ=';

  // An 11-char password: valid under the OLD minimum (PASSWORD_MIN_LENGTH
  // was 10 pre-migration) but shorter than today's floor of 12. hashPassword
  // would reject this length, so the rehash-on-login path must use
  // bcryptHash directly (bypassing PASSWORD_MIN_LENGTH) or this account can
  // never migrate off scrypt. Same generation method as LEGACY_HASH above,
  // just a different fixed salt.
  const SHORT_LEGACY_PASSWORD = 'short11chr!'; // 11 chars
  const SHORT_LEGACY_HASH =
    'scrypt$16384$8$1$ZmVkY2JhOTg3NjU0MzIxMA==$aiTmyfKhn5l6PofYTu2gA/UUEQwhu5UFDbL2G/u++3E=';

  beforeEach(() => {
    state.user = {
      id: 'rehash-user-1',
      email: LOGIN_EMAIL,
      phone: '9998887777',
      passwordHash: LEGACY_HASH,
      isActive: true,
      lockedUntil: null,
      failedAttempts: 0,
    };
    state.auditShouldFail = false;
    pgQuery.mockClear();
    lookupProfile.mockResolvedValue({
      id: state.user.id, phone: state.user.phone, fullName: 'Rehash Test User', roles: [], permissions: [],
    });
  });

  async function postLoginWith(config, password) {
    const app = createApp(config, { provider: captureProvider() });
    const server = app.listen(0);
    try {
      const { port } = server.address();
      const { code, token } = issueCaptcha(config.sessionSecret);
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `eworks_captcha=${encodeURIComponent(token)}`,
        },
        body: JSON.stringify({ email: LOGIN_EMAIL, password, captcha: code }),
      });
      return { status: res.status, body: await res.json() };
    } finally {
      server.close();
    }
  }

  it('accepts the correct password against a legacy scrypt hash and transparently rehashes it to bcrypt', async () => {
    const config = loadConfig({ MFA_ENABLED: 'false', EWORKS_USE_LOCAL_PG: '1' });

    const { status, body } = await postLoginWith(config, LEGACY_PASSWORD);

    expect(status).toBe(200);
    expect(body.authenticated).toBe(true);

    const rehashCall = pgQuery.mock.calls.find(
      ([sql]) => sql.includes('update eworks.user_profiles') && sql.includes('password_hash'),
    );
    expect(rehashCall).toBeTruthy();
    const [, params] = rehashCall;
    expect(params[0]).toMatch(/^bcrypt\$/);
    expect(params[1]).toBe(state.user.id);
  });

  it('rehashes a legacy account even when its real password is shorter than the current minimum', async () => {
    // Point this login at the short-password fixture instead of the default
    // beforeEach state.
    state.user.passwordHash = SHORT_LEGACY_HASH;
    const config = loadConfig({ MFA_ENABLED: 'false', EWORKS_USE_LOCAL_PG: '1' });

    const { status, body } = await postLoginWith(config, SHORT_LEGACY_PASSWORD);

    expect(status).toBe(200);
    expect(body.authenticated).toBe(true);

    const rehashCall = pgQuery.mock.calls.find(
      ([sql]) => sql.includes('update eworks.user_profiles') && sql.includes('password_hash'),
    );
    // Before the bcryptHash fix, hashPassword's PASSWORD_MIN_LENGTH gate
    // threw for this 11-char password, the throw was swallowed by the
    // rehash's try/catch, and this update never fired — this account would
    // be stuck on scrypt forever.
    expect(rehashCall).toBeTruthy();
    const [, params] = rehashCall;
    expect(params[0]).toMatch(/^bcrypt\$/);
    expect(params[1]).toBe(state.user.id);
  });

  it('does not touch password_hash on a wrong password against a legacy scrypt hash', async () => {
    const config = loadConfig({ MFA_ENABLED: 'false', EWORKS_USE_LOCAL_PG: '1' });

    const { status } = await postLoginWith(config, 'definitely-the-wrong-password');

    expect(status).toBe(401);
    const rehashCall = pgQuery.mock.calls.find(
      ([sql]) => sql.includes('update eworks.user_profiles') && sql.includes('password_hash'),
    );
    expect(rehashCall).toBeFalsy();
  });
});

// Route-level enumeration parity: /api/auth/login must not let an attacker
// distinguish "no such account" from "wrong password" from "account disabled"
// from "account locked" from "this email belongs to a vendor, not an
// officer" — every one of these is a fact about account existence/state that
// the generic 401 must hide. These are regression guards over behavior the
// earlier Phase-1 tasks already implemented (DUMMY_PASSWORD_HASH, isLocked
// short-circuit, no role branching before a password is verified) — they are
// expected to pass on first run.
describe('/api/auth/login route-level enumeration parity', () => {
  const WRONG_PASSWORD = 'definitely-wrong-password';
  const GENERIC_401 = { error: 'invalid_credentials' };
  // A real bcrypt hash of a password that WOULD authenticate, used for the
  // inactive/locked guards below: submitting the CORRECT password against
  // this hash is what makes those two guards prove something — if the
  // handler's isActive or isLocked short-circuit were deleted, this password
  // would otherwise complete a successful login.
  const CORRECT_PASSWORD = 'CorrectHorseBattery99';
  let CORRECT_PASSWORD_HASH;

  beforeEach(async () => {
    state.user = null;
    state.auditShouldFail = false;
    pgQuery.mockClear();
    if (!CORRECT_PASSWORD_HASH) CORRECT_PASSWORD_HASH = await hashPassword(CORRECT_PASSWORD);
  });

  async function postLoginAs(config, email, password = WRONG_PASSWORD) {
    const app = createApp(config, { provider: captureProvider() });
    const server = app.listen(0);
    try {
      const { port } = server.address();
      // A fresh, valid captcha per request: captcha verification happens
      // before credentials and must not be what's under test here.
      const { code, token } = issueCaptcha(config.sessionSecret);
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `eworks_captcha=${encodeURIComponent(token)}`,
        },
        body: JSON.stringify({ email, password, captcha: code }),
      });
      return { status: res.status, body: await res.json() };
    } finally {
      server.close();
    }
  }

  it('unknown email, wrong password on a known account, an inactive account, and a locked account are byte-identical 401s', async () => {
    const config = loadConfig({ MFA_ENABLED: 'false', EWORKS_USE_LOCAL_PG: '1' });

    // (a) unknown email — no matching row at all.
    state.user = null;
    const unknown = await postLoginAs(config, 'nobody@example.com');

    // (b) known email, wrong password — an active, unlocked account.
    state.user = {
      id: 'parity-user-1', email: 'known@example.com', phone: '9990001111',
      passwordHash: 'not-a-real-scrypt-hash', isActive: true, lockedUntil: null, failedAttempts: 0,
    };
    const wrongPassword = await postLoginAs(config, 'known@example.com');

    // (c) inactive account — CORRECT password against a real bcrypt hash, so
    // the only thing standing between this request and a successful login is
    // the isActive check. If that check were deleted, this would authenticate.
    state.user = {
      id: 'parity-user-2', email: 'inactive@example.com', phone: '9990002222',
      passwordHash: CORRECT_PASSWORD_HASH, isActive: false, lockedUntil: null, failedAttempts: 0,
    };
    const inactive = await postLoginAs(config, 'inactive@example.com', CORRECT_PASSWORD);

    // (d) locked account — lockedUntil in the future, threshold already hit,
    // and again the CORRECT password against a real bcrypt hash. If isLocked
    // were deleted, this would authenticate.
    state.user = {
      id: 'parity-user-3', email: 'locked@example.com', phone: '9990003333',
      passwordHash: CORRECT_PASSWORD_HASH, isActive: true,
      lockedUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString(), failedAttempts: 5,
    };
    const locked = await postLoginAs(config, 'locked@example.com', CORRECT_PASSWORD);

    for (const result of [unknown, wrongPassword, inactive, locked]) {
      expect(result.status).toBe(401);
      expect(result.body).toEqual(GENERIC_401);
    }
  });

  it('a vendor account gets the same generic error as an unknown account — login has no vendor-specific branch', async () => {
    const config = loadConfig({ MFA_ENABLED: 'false', EWORKS_USE_LOCAL_PG: '1' });

    // A vendor's email/password submitted to the officer login route: nothing
    // in the handler special-cases the account's eventual role (that lookup
    // only happens later, past the password check), so this must fail
    // exactly like every other case above.
    state.user = {
      id: 'vendor-parity-1', email: 'vendor@example.com', phone: '9990004444',
      passwordHash: 'not-a-real-scrypt-hash', isActive: true, lockedUntil: null, failedAttempts: 0,
    };
    const vendorResult = await postLoginAs(config, 'vendor@example.com');

    state.user = null;
    const unknownResult = await postLoginAs(config, 'nobody-else@example.com');

    expect(vendorResult.status).toBe(401);
    expect(vendorResult.body).toEqual(GENERIC_401);
    expect(unknownResult.status).toBe(vendorResult.status);
    expect(unknownResult.body).toEqual(vendorResult.body);
  });

  it('runs the real password-verify step even for an unknown account (structural, not wall-clock, timing parity)', async () => {
    // Not a timing assertion — asserts the STRUCTURE that makes timing parity
    // true: an unknown account still reaches bcrypt.compare, against
    // DUMMY_PASSWORD_HASH rather than short-circuiting before any hashing
    // work happens. A millisecond-level timing assertion would be flaky;
    // this is not one.
    const config = loadConfig({ MFA_ENABLED: 'false', EWORKS_USE_LOCAL_PG: '1' });
    const compareSpy = vi.spyOn(bcrypt, 'compare');

    try {
      state.user = null; // unknown account
      await postLoginAs(config, 'ghost@example.com');

      expect(compareSpy).toHaveBeenCalled();
      const [, hashArg] = compareSpy.mock.calls[0];
      expect(DUMMY_PASSWORD_HASH).toBe(`bcrypt$${hashArg}`);
    } finally {
      compareSpy.mockRestore();
    }
  });
});
