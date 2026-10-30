# Oversight — District search/pagination + Ledger filters

**Date:** 2026-07-25
**Branch:** `integrate/redesign-plus-tenders`

## Goal

Make the Oversight tables hold up as data grows.

- **Districts** (bounded ~37): add a name **search** + **client-side pagination**.
- **Order ledger** (server-paged): add **Status** and **District** filter dropdowns
  that run server-side (correct across pages). Keep existing pagination; page
  resets to 1 on any filter change.

## Backend (server-side ledger status filter)

- `server/oversight-queries.mjs` — `financeOrders(client, { limit, offset, district, status })`:
  add `and ($n::text is null or o.status = $n::text)` to both the count and the
  page query (district stays as-is).
- `server/bff.mjs` `GET /api/gov/oversight/finance/orders`: parse `status`,
  accept only the known enum (`DRAFT|FLOATED|REVEALING|AWARDED|CANCELLED|FAILED`,
  else null), pass through.

## Frontend

- `oversightApi.ts` / `useOversight.ts`: `fetchFinanceOrders`/`useFinanceOrders`
  gain a `status` arg; the query key includes it.
- `OrderLedger.tsx`: header gets a **Status** `<select>` (All + enum, title-cased)
  and a **District** `<select>` (All + district names). District select is driven
  by new props `districts` + `onDistrictFilter` so it stays in sync with the
  click-a-row filter. `status` is local state. Reset page on `[districtFilter, status]`.
- `FinanceOverview.tsx`: passes `districts` + `onDistrictFilter={setDistrictFilter}`
  to the ledger. District card gets a **search input** (client filter by name) and
  a footer **Pagination** (10/page, client-side over the filtered list). Reset page
  on query change.
- i18n (en/ta): `oversight.filterDistrictSearch`, `oversight.filterAllStatuses`,
  `oversight.filterAllDistricts`.

## Testing

- Unit: extend financeModel/oversight tests if a pure helper is added (status
  title-case). Manual: filter ledger by status + district, page through; search
  districts + page; both correct.
- `tsc`, `oxlint`, `vite build`, existing tests green.

## Out of scope

- Server-side pagination for districts (bounded set — client-side is enough).
- Free-text order search (chosen: Status + District only).
