# No-scroll auto-fit sidebar rail with "More" overflow

**Date:** 2026-07-25
**Branch:** `integrate/redesign-plus-tenders`

## Problem

The gov/vendor/contractor icon rail (`DashboardShell`) uses `overflow-y-auto`, so
when a role holds more tabs than fit the viewport height, the nav scrolls. We want
the Zoho pattern: the rail never scrolls — as many tabs as fit are shown, and the
rest collapse into a **More (•••)** flyout.

## Behavior

- The rail shows as many tabs as **physically fit** without scrolling. No scrollbar.
- Overflow tabs collapse under a **More** item pinned at the bottom of the tab list
  (above the existing Settings / Help block, which is unchanged).
- Clicking **More** opens a **flyout popover to the right** of the rail listing the
  hidden tabs as icon + label rows. Closes on outside-click, Esc, or navigation.
- **Priority = existing nav order.** Items overflow from the bottom (least-important
  first). No reordering of `navConfig`.
- If the active route is a hidden tab, the **More** item shows the active highlight
  and that tab is floated to the top of the popover, so the user never loses place.
- Recomputes on window **resize / zoom** via `ResizeObserver` — never scrolls at any
  height.

## Units

### `railOverflow.ts` — pure fit math (unit-tested)
```
computeVisibleCount({ availableHeight, itemHeight, moreItemHeight, totalItems }): number
```
- If every item fits (`floor(available / itemHeight) >= total`) → return `total`
  (no More needed).
- Otherwise reserve one slot for the More button:
  `min(floor((available - moreItemHeight) / itemHeight), total - 1)`, clamped `>= 0`.
- Degenerate inputs (≤0) → `0`.

### `OverflowRailNav.tsx` — the rail nav + More popover
- Props: `navItems: DashboardNavItem[]`.
- Measures the nav container's `clientHeight` and one rendered item's height
  (`useLayoutEffect` + `ResizeObserver`), feeds `computeVisibleCount`.
- Renders visible items (icon-over-label `NavLink`s), then a More button when
  `visibleCount < total`. The popover is `position: fixed`, placed from the More
  button's bounding rect (so it escapes the narrow rail without clipping).
- Active-in-overflow: More gets active styling; active item floated to popover top.
- a11y: More button `aria-haspopup="menu"` / `aria-expanded`; popover `role="menu"`,
  rows `role="menuitem"`; Esc + outside-click close.

### `DashboardShell.tsx` — integration
- Replace the `<nav>…overflow-y-auto…{navItems.map(...)}…</nav>` block with
  `<OverflowRailNav navItems={navItems} />`. Everything else (top bar, Settings,
  Help, notifications) unchanged.

## Testing

- Unit: `railOverflow.test.ts` covers all-fit, exact-fit, overflow-by-one,
  overflow-by-many, and degenerate inputs.
- Manual: gov District Officer (many tabs) at tall and short window heights; confirm
  no scrollbar, More appears/disappears on resize, popover lists the rest, and the
  active overflow tab highlights More.

## Out of scope

- Reordering tabs / configurable priority (uses existing nav order).
- The mobile drawer (`lg:hidden`) keeps its current full-list behavior — it already
  scrolls as a drawer, which is expected on mobile.
