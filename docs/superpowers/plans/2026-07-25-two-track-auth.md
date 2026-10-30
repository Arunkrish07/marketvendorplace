# Two-Track Auth (Officers = Email+Password+TOTP · Vendors/Contractors = Phone+OTP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce, server-side, that government officers sign in with email + password (+ TOTP, mandatory for HEAD_ADMIN/DISTRICT_ADMIN) and vendors/contractors sign in with phone + OTP only — auditing the existing code and closing gaps rather than rebuilding.

**Architecture:** The BFF (`web/server/`) already holds server-side sessions in HTTP-only cookies and enforces RLS; officer email+password and vendor phone+OTP both already exist. This plan adds account lockout, a login chooser that routes each audience to its one method, an email/invite pipeline for officers, app-based TOTP (replacing the officer SMS second factor), and closes an OTP phone-enumeration leak. Work is phased so each phase ships independently.

**Tech Stack:** Node ESM BFF (Express 5 + `pg`), React 19 + Vite + TS frontend, PostgreSQL (`eworks` schema), Vitest (`@vitest-environment node` for server, jsdom for UI). New deps: `bcryptjs` (KDF), `otplib` + `qrcode` (TOTP), `nodemailer` (SMTP).

## Global Constraints

- **Hard split (server-enforced):** officers = email + password (+ optional TOTP); vendors/contractors = phone + OTP. One account = one method. Never collect a phone for officer login; never a password for vendor/contractor login. (spec §1)
- **Enumeration resistance:** wrong-method or non-existent identifier returns the *same* generic error with no material timing/shape difference; no endpoint reveals which method (or whether an account) exists. (spec §1, §5)
- **Password hashing:** argon2id, or **bcrypt cost ≥ 12** if argon2 unavailable. Never log/return hashes; constant-time compare. → **Decision (adopted): bcryptjs cost 12** (pure-JS, no native build on Windows). (spec §2)
- **Sessions:** unchanged — server-side session + HTTP-only, Secure, SameSite cookie via the BFF; no JWT in localStorage. (spec §2)
- **No officer self-registration.** Officer accounts come only from the admin add-officer flow, which emails a single-use 24 h set-password link. (spec §2)
- **Password policy:** length ≥ 12, zxcvbn score ≥ 3; changing password invalidates other sessions. (spec §2)
- **Lockout:** 5 failed attempts → 15 min lock, per account **and** per IP; lockouts audit-logged. (spec §2)
- **TOTP:** optional for all officers; **mandatory for HEAD_ADMIN and DISTRICT_ADMIN** (forced enrolment at first login, verified every login). (spec §2)
- **Mailer:** pluggable SMTP via env (`load-env.mjs` pattern); all mail through the notifications outbox; dev mode prints the link on screen exactly like on-screen OTP. Templates in `docs/email-templates.md`. (spec §2)
- **DoD gates:** `npm run test`, `npm run lint`, `tsc -b` all green; en + ta strings for new UI. (spec §5)

**Migration of existing hashes (adopted):** existing scrypt hashes are re-hashed to bcrypt transparently on next successful login (verify with the stored `scrypt$…`, then overwrite with `bcrypt$…`); no forced reset. The self-describing hash prefix makes the KDF per-row.

---

## Phase 1 — Officer auth hardening (no new deps)

Closes lockout, the OTP enumeration leak, and the DISTRICT_ADMIN MFA gap; adds the credential columns later phases need; adds route-level tests. Ships on its own.

### Task 1: Credentials columns + DISTRICT_ADMIN MFA

**Files:**
- Create: `supabase/migrations/20260726000100_officer_auth_hardening.sql`
- Modify: `web/server/auth.mjs` (GOV_ROLES set, ~line 11-14)
- Test: `supabase/tests/` — add assertions to an existing identity test, or new `supabase/tests/13_officer_auth.sql`

**Interfaces:**
- Produces: `eworks.user_profiles` gains `password_set_at timestamptz`, `failed_attempts int not null default 0`, `locked_until timestamptz`, `totp_secret text`, `totp_enrolled_at timestamptz`, `totp_recovery_hashes text[]`. Consumed by Tasks 2, 13, 14.

- [ ] **Step 1: Write the migration**

```sql
-- 20260726000100_officer_auth_hardening.sql
set search_path = eworks, public;
alter table eworks.user_profiles
  add column if not exists password_set_at    timestamptz,
  add column if not exists failed_attempts     integer not null default 0,
  add column if not exists locked_until        timestamptz,
  add column if not exists totp_secret         text,
  add column if not exists totp_enrolled_at    timestamptz,
  add column if not exists totp_recovery_hashes text[];
comment on column eworks.user_profiles.totp_secret is 'base32 TOTP secret; null until enrolled. Never leaves the server.';
```

- [ ] **Step 2: Apply to the local DB and verify columns exist**

Run: `EWORKS_USE_LOCAL_PG=1 psql "$LOCAL_URL" -f supabase/migrations/20260726000100_officer_auth_hardening.sql` then `\d eworks.user_profiles`.
Expected: the five new columns present.

- [ ] **Step 3: Add DISTRICT_ADMIN to GOV_ROLES**

In `web/server/auth.mjs`, the `GOV_ROLES` set (~line 11) currently omits `DISTRICT_ADMIN`. Add it:

```js
const GOV_ROLES = new Set([
  'SITE_ENGINEER', 'EXECUTIVE_ENGINEER', 'DISTRICT_OFFICER',
  'SUPERINTENDING_ENGINEER', 'AUDITOR', 'HEAD_ADMIN', 'DISTRICT_ADMIN',
]);
```

- [ ] **Step 4: Add a unit test that DISTRICT_ADMIN requires MFA**

In `web/server/auth.test.mjs` add a case asserting `userRequiresMfa` (or the exported predicate) returns true for `DISTRICT_ADMIN`. Run `npx vitest run server/auth.test.mjs` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260726000100_officer_auth_hardening.sql web/server/auth.mjs web/server/auth.test.mjs
git commit -m "feat(auth): credential-hardening columns + DISTRICT_ADMIN MFA"
```

### Task 2: Per-account lockout on /api/auth/login

**Files:**
- Create: `web/server/lockout.mjs`
- Modify: `web/server/bff.mjs` (the `/api/auth/login` handler)
- Test: `web/server/lockout.test.mjs`

**Interfaces:**
- Produces: `lockout.mjs` exports `MAX_FAILED = 5`, `LOCK_MS = 15*60*1000`, `isLocked(user, now)` → bool, `recordFailure(pool, userId, now)` (increments `failed_attempts`; sets `locked_until = now+LOCK_MS` and audit-logs when it crosses MAX_FAILED), `clearFailures(pool, userId)` (zeroes on success).

- [ ] **Step 1: Write failing unit tests for the pure predicate**

```js
// lockout.test.mjs — @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isLocked, MAX_FAILED, LOCK_MS } from './lockout.mjs';
describe('isLocked', () => {
  const now = 1_000_000;
  it('is false with no lock', () => expect(isLocked({ locked_until: null }, now)).toBe(false));
  it('is true while locked', () => expect(isLocked({ locked_until: new Date(now + 1000).toISOString() }, now)).toBe(true));
  it('is false once the lock elapses', () => expect(isLocked({ locked_until: new Date(now - 1).toISOString() }, now)).toBe(false));
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run server/lockout.test.mjs` → FAIL (module missing).

- [ ] **Step 3: Implement `lockout.mjs`**

```js
export const MAX_FAILED = 5;
export const LOCK_MS = 15 * 60 * 1000;
export function isLocked(user, now = Date.now()) {
  if (!user?.locked_until) return false;
  return new Date(user.locked_until).getTime() > now;
}
export async function recordFailure(pool, userId, now = Date.now()) {
  const { rows } = await pool.query(
    `update eworks.user_profiles
        set failed_attempts = failed_attempts + 1,
            locked_until = case when failed_attempts + 1 >= $2
                                then to_timestamp($3 / 1000.0) else locked_until end
      where id = $1
      returning failed_attempts, locked_until`,
    [userId, MAX_FAILED, now + LOCK_MS],
  );
  return rows[0] ?? null;
}
export async function clearFailures(pool, userId) {
  await pool.query(
    `update eworks.user_profiles set failed_attempts = 0, locked_until = null where id = $1`,
    [userId],
  );
}
```

- [ ] **Step 4: Run to verify the predicate tests pass** — `npx vitest run server/lockout.test.mjs` → PASS.

- [ ] **Step 5: Wire into `/api/auth/login`**

In `bff.mjs`, after resolving `user` and BEFORE returning on bad credentials: if `user && isLocked(user)` return the same generic `401 invalid_credentials` (do not reveal the lock). On a verified-bad password with a known user, `await recordFailure(pool, user.id)`. On success, `await clearFailures(pool, user.id)` before issuing the session/MFA. Keep the existing dummy-hash path so timing for unknown accounts is unchanged. Audit-log the lock event via the existing audit helper when `recordFailure` returns `failed_attempts >= MAX_FAILED`.

- [ ] **Step 6: Add an HTTP-level lockout test**

`web/server/bff-auth-routes.test.mjs`: build the app with a stub pool, POST 5 bad logins for a seeded email, assert the 6th returns the generic error and that `recordFailure` set `locked_until`. Run the suite → PASS.

- [ ] **Step 7: Commit**

```bash
git add web/server/lockout.mjs web/server/lockout.test.mjs web/server/bff.mjs web/server/bff-auth-routes.test.mjs
git commit -m "feat(auth): per-account lockout (5 fails / 15 min) on password login"
```

### Task 3: Close the OTP phone-enumeration leak

**Files:**
- Modify: `web/server/bff.mjs` (`/api/auth/otp/send`, ~line 239-259)
- Test: `web/server/bff-auth-routes.test.mjs`

**Interfaces:** unchanged signatures; response for an unknown phone becomes identical to a known one.

- [ ] **Step 1: Write the failing test** — POST `/api/auth/otp/send` with a phone that has no profile; assert `200` with the same body shape as a known phone (`{ sent: true, maskedPhone, requiresMfa:false }` using a masked form of the *submitted* number), NOT `404 unknown_phone`. Run → FAIL (currently 404).

- [ ] **Step 2: Implement** — when no profile matches, skip issuing/sending a real challenge but return the same success shape (mask the submitted phone). Keep the per-phone + per-IP rate limits so it isn't a free SMS relay. Never send an SMS for an unknown number.

- [ ] **Step 3: Run the test** → PASS. Also assert no provider send happened for the unknown number.

- [ ] **Step 4: Commit** — `git commit -m "fix(auth): /otp/send no longer leaks whether a phone exists"`.

### Task 4: KDF migration to bcrypt (cost 12) with rehash-on-login

**Files:**
- Modify: `web/package.json` (add `bcryptjs`), `web/server/password.mjs`, `web/server/bff.mjs` (login success path)
- Test: `web/server/password.test.mjs`

**Interfaces:**
- Produces: `password.mjs` — `hashPassword(pw)` now returns a `bcrypt$…`-prefixed encoding; `verifyPassword(pw, encoded)` accepts BOTH `scrypt$…` (legacy) and `bcrypt$…`; new export `needsRehash(encoded)` → true for legacy scrypt.

- [ ] **Step 1** Add `bcryptjs` to `web/package.json` deps; `npm install`.
- [ ] **Step 2: Extend tests** — assert `hashPassword` output starts with `bcrypt$`; assert `verifyPassword` still verifies an existing `scrypt$…` fixture; assert `needsRehash('scrypt$…')===true` and `needsRehash('bcrypt$…')===false`. Run → FAIL.
- [ ] **Step 3: Implement** — dispatch in `verifyPassword` on the prefix; keep scrypt verify for legacy; `hashPassword` uses `bcryptjs.hash(pw, 12)` wrapped as `bcrypt$<hash>`; add `needsRehash`. Preserve `DUMMY_PASSWORD_HASH` (regenerate as bcrypt) and `PASSWORD_MIN_LENGTH ≥ 12`.
- [ ] **Step 4** In `bff.mjs` login success, if `needsRehash(user.passwordHash)` then `await pool.query('update … set password_hash=$1, password_set_at=now() where id=$2', [await hashPassword(password), user.id])` (best-effort, never blocks login).
- [ ] **Step 5: Run tests** → PASS. `tsc -b` + `npm run lint` green.
- [ ] **Step 6: Commit** — `git commit -m "feat(auth): bcrypt(12) hashing with transparent scrypt→bcrypt rehash-on-login"`.

### Task 5: Route-level enumeration + timing test

**Files:** `web/server/bff-auth-routes.test.mjs`
- [ ] **Step 1** Add tests asserting `/api/auth/login` returns byte-identical body + status for (a) unknown email, (b) known email/wrong password, (c) inactive account. Assert a vendor email routed to `/api/auth/login` yields the same generic error.
- [ ] **Step 2** Assert `/api/auth/otp/send` returns identical shape for known vs unknown phone (guards Task 3).
- [ ] **Step 3** Run the full server suite → PASS. **Commit** — `git commit -m "test(auth): route-level enumeration parity for login and otp/send"`.

**Phase 1 gate:** `npm run test`, `npm run lint`, `tsc -b` green. Ships: hardened officer login with lockout, no OTP oracle, bcrypt, DISTRICT_ADMIN MFA.

---

## Phase 2 — Login chooser UI (wire the orphaned vendor form)

`PhoneSignIn.tsx` exists but is unreachable; vendors currently have no working sign-in. Add a chooser.

### Task 6: /login chooser with Officer / Vendor / Contractor tabs

**Files:**
- Modify: `web/src/app/DevSignIn.tsx` (render a tabbed chooser inside the form panel)
- Reuse: `web/src/features/auth/EmailSignIn.tsx` (Officer), `web/src/features/auth/PhoneSignIn.tsx` (Vendor & Contractor)
- Modify: `web/src/i18n/en.json`, `web/src/i18n/ta.json` (tab labels + helper copy)
- Test: `web/src/features/auth/SignInChooser.test.tsx`

**Interfaces:**
- Produces: a `tab` state (`'officer' | 'vendor' | 'contractor'`); Officer tab renders `<EmailSignIn/>`, the other two render `<PhoneSignIn/>` (PhoneSignIn already drives `/api/auth/otp/*` and lands via `portalHomePathForSession`). Captcha stays on the officer (password) form only.

- [ ] **Step 1: Write the failing component test** — render the chooser; assert three tabs; clicking "Vendor" shows the mobile-number field (from PhoneSignIn) and hides the password field; clicking "Officer" shows email + password. Run → FAIL.
- [ ] **Step 2: Implement the tab UI** in the right-hand panel of `DevSignIn.tsx`: a segmented control above the form; keep the image-box left panel unchanged. Default tab = officer. Copy helper text per audience.
- [ ] **Step 3: Verify `PhoneSignIn` lands correctly** — confirm it calls `useOtpSend`/`useOtpVerify` and navigates via `portalHomePathForSession`; if it references removed props, fix to match the current session hook.
- [ ] **Step 4: Run the test** → PASS. Add i18n keys in en + ta.
- [ ] **Step 5: Drive it in the browser** (both tabs) via the run/skill; officer email login and a vendor phone-OTP login both reach their portals. Screenshot.
- [ ] **Step 6: Commit** — `git commit -m "feat(auth): /login chooser routing officers to password, vendors/contractors to OTP"`.

**Phase 2 gate:** both audiences can sign in from `/sign-in`; suites green.

---

## Phase 3 — Mailer + officer invite / set-password + add-officer fix

### Task 7: Env-driven mailer through the notifications outbox

**Files:**
- Create: `web/server/mailer.mjs`
- Modify: `web/server/env.mjs` (SMTP env: `SMTP_HOST/PORT/USER/PASS/FROM`, `MAIL_MODE=smtp|console`), `web/package.json` (`nodemailer`)
- Create: `web/server/mailer.test.mjs`

**Interfaces:**
- Produces: `sendMail({ to, template, vars })` — in `MAIL_MODE=console` (dev) it logs + returns `{ devLink }`; in `smtp` mode it enqueues into the notifications outbox and a drainer delivers via nodemailer. Templates keyed by name (invite, reset, lockout, new-device).

- [ ] **Step 1** Add `nodemailer`; add SMTP env with safe dev defaults (`MAIL_MODE=console`), required-in-prod list updated.
- [ ] **Step 2: Test** — in console mode, `sendMail` returns a `devLink` and sends nothing; templates render `vars`. Run → FAIL then implement → PASS.
- [ ] **Step 3** Route existing forgot-password to `sendMail` (replacing the raw `console.log`), preserving the on-screen dev link. Commit.

### Task 8: 24 h single-use set-password invite token

**Files:**
- Create: `supabase/migrations/20260726000200_set_password_tokens.sql` (mirror `password_reset_tokens`, `purpose in ('reset','invite')`, invite TTL 24 h)
- Modify: `web/server/password-reset.mjs` (add `INVITE_TOKEN_TTL_MS = 24*60*60*1000`, reuse gen/HMAC), `web/server/bff.mjs` (issue on invite; `/api/auth/password/set` accepts invite tokens)
- Test: `web/server/password-reset.test.mjs`

- [ ] Steps: write TTL/purpose tests (FAIL) → implement token issue+verify (single-use, 24 h) → PASS → commit.

### Task 9: Add-officer flow — email required, phone removed, invite sent

**Files:**
- Modify: `web/server/admin.mjs` (`/api/admin/users` POST, ~line 167-225), `web/src/features/admin/UsersTab.tsx`, i18n en/ta
- Test: `web/server/admin.test.mjs`

**Interfaces:** the POST body drops `phone`, requires a valid unique `email`; on success it issues a 24 h invite token and calls `sendMail({template:'invite'})`; response never includes the token.

- [ ] **Step 1: Failing test** — POST without email → `400 email_required`; POST with phone → phone ignored/rejected; POST valid → profile+role created, `sendMail` invite called once, no token in response. Run → FAIL.
- [ ] **Step 2: Implement** — remove `PHONE_RE`/phone handling, make email required + lowercased + unique-checked, issue invite token, send mail, audit-log. Remove the phone field from `UsersTab.tsx`; add "invite sent" UI copy.
- [ ] **Step 3** Run tests → PASS; drive the admin add-officer flow in the browser (dev mail mode shows the link) → officer sets password → lands in gov portal. Commit.

### Task 10: migrate-officer-auth.mjs + email-templates.md

**Files:** Create `web/server/migrate-officer-auth.mjs` (lists officer profiles with `email is null`, read-only report; never invents emails), Create `docs/email-templates.md` (invite, reset, lockout, new-device — subject + body + vars).
- [ ] Steps: write the report script (query officers-without-email, print table) → run against local DB → PASS; write templates doc → commit.

**Phase 3 gate:** admin adds an officer by email → invite email (dev on-screen) → set password → gov portal; suites green; templates documented.

---

## Phase 4 — TOTP 2FA (replaces officer SMS second factor)

### Task 11: TOTP enrolment (secret + QR + recovery codes)

**Files:**
- Create: `web/server/totp.mjs` (wrap `otplib`), `web/package.json` (`otplib`, `qrcode`)
- Modify: `web/server/bff.mjs` (enrolment routes), storage uses Task 1 columns
- Test: `web/server/totp.test.mjs`

**Interfaces:**
- Produces: `totp.mjs` — `generateSecret()`, `otpauthUrl(secret, email)`, `verifyToken(secret, token)` (±1 step window), `makeRecoveryCodes()`→{plain[], hashes[]}, `verifyRecovery(hashes, code)`. Routes: `POST /api/auth/totp/enroll` (returns otpauth URL + QR data-URL + one-time recovery codes; stores `totp_secret` provisional), `POST /api/auth/totp/activate` (verifies first token, sets `totp_enrolled_at`, persists `totp_recovery_hashes`).

- [ ] Steps: write verify/window/recovery tests (FAIL) → implement wrappers → PASS → enrolment routes with a UI screen (QR + recovery codes) → commit.

### Task 12: Enforce TOTP at login; mandatory for HEAD_ADMIN/DISTRICT_ADMIN; retire officer SMS-MFA

**Files:**
- Modify: `web/server/bff.mjs` (`/api/auth/login` second-factor branch), `web/server/auth.mjs`, `web/src/features/auth/EmailSignIn.tsx` (TOTP code step + forced-enrolment redirect), i18n
- Test: `web/server/bff-auth-routes.test.mjs`, `web/src/features/auth/EmailSignIn.test.tsx`

**Interfaces:** on officer password success, if `totp_enrolled_at` set → require a TOTP code (or recovery code) before issuing the session; if role ∈ {HEAD_ADMIN, DISTRICT_ADMIN} and not enrolled → respond `{ enrollTotp: true }` and force the enrolment screen at first login. The old phone-SMS `purpose:'mfa'` challenge is removed from the officer path (vendors never had it).

- [ ] Steps: failing tests (enrolled → code required; admin-not-enrolled → forced enrol; recovery-code path; wrong code rejected) → implement → PASS → browser demo: HEAD_ADMIN first login forces enrol, subsequent logins require code → commit.

**Phase 4 gate:** officers use app TOTP; admins forced; SMS second factor gone from officer login; full spec §5 test list green.

---

## Self-Review notes

- **Spec coverage:** §1 split → Task 6 (UI) + Tasks 3/5/9 (server enforcement + enumeration); §2 hashing → Task 4; columns → Task 1; no-self-reg/invite → Tasks 8/9; forgot-pw → already present, mailer in Task 7; policy ≥12/zxcvbn → Task 4 (min-len) + add zxcvbn check in Task 8 set-password; lockout → Task 2; TOTP → Tasks 11/12; mailer/templates → Tasks 7/10. §3 vendor OTP + no drift → Task 6 verifies. §4 migration → Task 10. §5 tests → each task’s tests + Task 5.
- **Open decisions to confirm before Phase 3/4:** real SMTP creds (else stays console); whether to keep an optional-TOTP path for non-admin officers (plan assumes yes). zxcvbn dependency added in Task 8.
- **Not placeholders:** where a task references an existing pattern (audit log helper, `password_reset_tokens` shape, `portalHomePathForSession`), the exact source file is named; implementers copy that pattern.
