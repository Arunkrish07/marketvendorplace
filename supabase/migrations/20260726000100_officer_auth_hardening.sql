-- Officer auth hardening: credential lifecycle + TOTP MFA columns.
--
-- Adds bookkeeping for password lifecycle (password_set_at), brute-force
-- protection (failed_attempts, locked_until), and TOTP-based MFA enrollment
-- (totp_secret, totp_enrolled_at, totp_recovery_hashes). Additive and
-- idempotent so it is safe to re-run against a live database.

alter table eworks.user_profiles
  add column if not exists password_set_at     timestamptz,
  add column if not exists failed_attempts      integer not null default 0,
  add column if not exists locked_until         timestamptz,
  add column if not exists totp_secret          text,
  add column if not exists totp_enrolled_at     timestamptz,
  add column if not exists totp_recovery_hashes text[];

comment on column eworks.user_profiles.password_set_at is
  'When the current password_hash was set. Null for accounts never given a password.';
comment on column eworks.user_profiles.failed_attempts is
  'Consecutive failed sign-in attempts since the last success; drives locked_until.';
comment on column eworks.user_profiles.locked_until is
  'Account locked against sign-in until this timestamp; null when not locked.';
comment on column eworks.user_profiles.totp_secret is
  'base32 TOTP secret; null until enrolled. Never leaves the server.';
comment on column eworks.user_profiles.totp_enrolled_at is
  'When TOTP MFA enrollment was completed; null until enrolled.';
comment on column eworks.user_profiles.totp_recovery_hashes is
  'Hashed one-time TOTP recovery codes; plaintext codes are never stored.';
