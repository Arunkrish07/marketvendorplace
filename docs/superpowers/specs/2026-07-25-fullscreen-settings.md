# Full-screen gov Settings (Zoho-style takeover)

**Date:** 2026-07-25
**Branch:** `integrate/redesign-plus-tenders`

## Problem

The gov `SettingsShell` renders inside `GovLayout` → `DashboardShell`, so the app's
icon rail and dark top bar surround Settings. We want Settings to take over the full
viewport like Zoho ERP: no app rail/top bar, its own header + left menu + content,
and a Close/Esc back to the dashboard.

## Approach

Make Settings its own **full-screen route**, outside the dashboard chrome.

### Routing (`App.tsx`)
- Remove the `settings` child route from the `/gov` (`GovLayout`) block.
- Add a sibling top-level route under `RequirePortal portal="gov"`:
  `/gov/settings` → `SettingsShell`, keeping the same child routes
  (`organization/profile`, `organization/hierarchy`, `organization/units`,
  `users`, `roles`, `roles/:code`, `nav-visibility`) and the index redirect.
- React Router ranks `/gov/settings/*` above `/gov`, so deep links keep working and
  the URL is unchanged.

### `SettingsShell` becomes a full-screen layout
- Root: `flex h-screen flex-col overflow-hidden bg-ground` (fills the viewport since
  it no longer sits inside `DashboardShell`).
- **Slim top header** spanning full width: emblem + "Settings" title on the left,
  **Close (✕)** button on the right. `Esc` also closes. Close/Esc → `navigate('/gov')`.
- **Body** `flex min-h-0 flex-1`:
  - Left: grouped settings menu (`lg:w-64`, own scroll) — unchanged groups.
  - Right: routed content pane, `min-w-0 flex-1 overflow-y-auto` with page padding.
- Mobile: header stays; body stacks (menu above content) and scrolls.

No settings *pages* change — only the frame. `RequirePortal portal="gov"` still
guards access; per-link permission gating in the menu is unchanged.

## Testing

- Manual: open `/gov/settings` as District Officer → full screen, no rail/top bar;
  left menu + content; navigate between Organization/Users tabs; Close and Esc both
  return to `/gov`; deep link to `/gov/settings/users` loads directly.
- `tsc`, `oxlint`, `vite build` clean.

## Out of scope

- Contractor/vendor `SettingsPage` (stays inline for now).
- Any change to individual settings pages' content or data.
