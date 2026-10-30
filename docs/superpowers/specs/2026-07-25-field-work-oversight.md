# Field work oversight tab

**Date:** 2026-07-25
**Branch:** `integrate/redesign-plus-tenders`

## Goal

Build the "Field work" oversight tab (currently a disabled "Coming soon" stub) as
a full mirror of the "Tenders & budget" finance tab, for the execution side of a
job: check-in → sampling → custody → lab results → certificate.

## RLS (prerequisite)

Gov oversight roles currently see **0** field rows — `jobs_read` etc. are scoped to
the vendor/technician. Mirror `orders_officer_read`: add SELECT policies for
`order.read` holders, scoped to the order's org, on the five field tables. RLS
policies are permissive (OR-ed), so these only grant.

Migration `20260725000100_field_oversight_read.sql`:
- `test_jobs` → join `test_orders o on o.id = test_jobs.order_id`.
- `site_checkins` / `test_results` / `certificates` → join `test_jobs j on j.id = …job_id`, then order.
- `chain_of_custody` → join `samples s on s.id = sample_id`, then job, then order.
Each: `and eworks.has_permission('order.read', ou.path)`.

## Backend — `server/oversight-field-queries.mjs`

- `fieldSummary(client)`: `activeJobs` (ASSIGNED…RECEIVED_AT_LAB), `testingJobs`,
  `completeJobs`, `resultsEntered`, `certificatesIssued`, `flaggedJobs`.
- `fieldJobs(client, { limit, offset, status, district })`: paginated ledger —
  `{ id, milestone, orgName, vendorName, technicianName, status, hasCheckin,
  resultState ('pass'|'fail'|'none'), certified }`, returns `{ rows, total }`.
- `fieldFlags(client)`: anomalies — `far_checkin` (distance_m > 500, warn),
  `clock_skew` (|clock_skew_s| > 300, warn), `missing_checkin` (status past
  CHECKED_IN, no check-in, warn), `failed_result` (passed=false, integrity),
  `provisional_result` (is_provisional, warn). `{ kind, severity, jobId, label }`.
- `fieldJobDetail(client, jobId)`: `{ job, checkin|null, custody[], results[],
  certificate|null }`.

Routes in `bff.mjs` under `/api/gov/oversight/field/*` mirroring the finance ones;
`status` validated against the `test_job_status` enum, `limit` clamped ≤100.

## Frontend — `src/features/gov/oversight/`

- Types in `domain.ts`: `FieldSummary`, `FieldJobRow`, `FieldJobsPage`,
  `FieldFlag`, `FieldJobDetail`.
- `fieldApi.ts` + `useField.ts` (react-query hooks, keys include status/district).
- `FieldOverview.tsx`: same two-pane shell as `FinanceOverview` — compact KPI row,
  left pane = `JobLedger`, sticky right rail = `FieldFlagsPanel` + selected
  `JobFieldDetail`.
- `JobLedger.tsx`: job table + Status dropdown (enum) + pagination; row click →
  select job. (No district dropdown v1 — status only, to keep it lean; district
  filter still available via URL/param if needed later.)
- `FieldFlagsPanel.tsx`: same look as `FlagsPanel`; clicking a flag selects its job.
- `JobFieldDetail.tsx`: check-in (distance/accuracy/skew/photo), custody timeline,
  results (pass/fail + provisional), certificate (issued/verified).
- i18n `field.*` keys (en/ta).
- `OversightPage.tsx`: enable the `field` tab → render `FieldOverview` (drop the
  disabled stub).

## Testing

- DB test `oversight-field.db.test.mjs`: under a gov session, `fieldJobs` returns
  scoped rows (non-zero for head admin after the migration), status filter returns
  only that status, `fieldSummary` counts are non-negative, `fieldFlags` shape is
  valid.
- `tsc`, `oxlint`, `vite build`, existing suites green.

## Out of scope

- Write actions (this is read-only oversight).
- Map rendering of check-in GPS (show distance/accuracy numerically for now).
