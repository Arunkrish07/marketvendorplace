# Oversight "Tenders & budget" — two-pane layout

**Date:** 2026-07-25
**Branch:** `integrate/redesign-plus-tenders`

## Problem

The Finance/Oversight tab (`FinanceOverview`) stacks five full-width blocks
vertically: KPI grid → Flags ("Needs attention") → District table → Order ledger
→ Vendor earnings. The Flags list is narrow content spread across the full width,
and everything stacks, so the page scrolls a lot.

## Design

Split the screen: wide tables in a left pane, narrow reference content in a
sticky right rail.

- **KPIs**: one compact row — `grid-cols-2 sm:grid-cols-4 xl:grid-cols-7`,
  slightly denser cards.
- **Two-pane grid** below (`xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start`):
  - **Left pane** (`min-w-0 space-y-6`): District table → Order ledger table →
    Vendor earnings.
  - **Right rail** (`space-y-6 xl:sticky xl:top-4`): `FlagsPanel` on top, then the
    selected-order detail (`OrderFinanceDetail`) or the empty-state card.
- Below `xl` the rail drops under the tables (single column), so mobile is
  unchanged in spirit.

### Component changes
- `FinanceOverview.tsx`: owns `selectedOrder`; renders the two-pane grid; the
  district table stays inline in the left pane; Flags + `OrderFinanceDetail` move
  to the right rail.
- `OrderLedger.tsx`: drop the internal `lg:grid-cols-[...]` split and the detail
  `aside`; return just the ledger card (table + pagination). It keeps
  `selectedOrder` (row highlight) and `onSelectOrder` (row click).

No data/query changes; every card keeps its own fetching.

## Testing

- Manual (Head Admin, `/gov/oversight`): KPIs in one row; tables left, flags +
  detail in a sticky rail; clicking a flag or a ledger row fills the detail in the
  rail without scrolling; far less total scroll.
- `tsc`, `oxlint`, `vite build`, existing tests clean.

## Out of scope

- The Field-work tab (still "coming soon").
- Any change to the finance data model or CSV exports.
