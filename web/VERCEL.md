# Deploying E-Works to Vercel

The frontend (Vite SPA) and the BFF (Express) deploy together to Vercel:

- The SPA is built with `vite build` → `dist/`.
- `server/bff.mjs` runs as a **single catch-all serverless function** at `api/index.js`.
- `vercel.json` rewrites every `/api/*` request to that function, and all other
  routes to `index.html` (SPA fallback).

## Project settings (Vercel dashboard or CLI)

- **Root Directory:** `web`
- **Framework Preset:** Vite (auto-detected)
- Build command / output are pinned in `vercel.json` (`vite build` → `dist`).

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Value | Notes |
|----------|-------|-------|
| `SUPABASE_DB_URL` | `postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres` | **Session pooler** (port 5432). `@` in the password must be `%40`. This is the only required var. |
| `SESSION_SECRET` | 32+ random chars | Stable secret so session + captcha cookies verify across invocations. `openssl rand -base64 32`. |
| `PG_POOL_MAX` | `2` | Keep the per-instance pool small so serverless instances don't exhaust the pooler. |
| `DEMO_MODE` | `true` | Optional. (Vercel sets `NODE_ENV=production` at runtime, which disables on-screen OTP anyway.) |

Do **not** set `EWORKS_ENV=production`: dev mode keeps the one-click **dev persona
picker** available (ideal for a public demo) and avoids requiring real SMS/MFA.

## Deploy

```bash
cd web
vercel link          # link to the Vercel project (first time)
vercel --prod        # build + deploy
```

Or connect the GitHub repo in the Vercel dashboard with Root Directory = `web`.

## Known limitations on serverless (by design, fine for a demo)

- **Phone-OTP login** uses an in-memory store → unreliable across invocations.
  Use the **dev persona picker** or **email + password** (`eworks-dev-2026`).
- **Rate limiting** is in-memory → best-effort per instance.
- **File uploads** (KYC docs, check-in photos, certificates) write to local disk,
  which is read-only on Vercel → those write endpoints fail. Browsing/reading the
  seeded demo data is unaffected.
