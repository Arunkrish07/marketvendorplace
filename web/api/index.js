// Vercel serverless entry point.
//
// The whole E-Works BFF (the Express app built by server/bff.mjs) is served as
// a single catch-all serverless function. vercel.json rewrites every /api/*
// request to this function; the Express app still matches on the original URL
// (e.g. /api/health), so none of the route definitions change.
//
// The app is created once per warm instance (module scope) and reused across
// invocations, so the pg pool and config are not rebuilt on every request.
//
// Known serverless caveats (fine for a demo, see web/VERCEL.md):
//   - Phone-OTP login uses an in-memory store and is unreliable across
//     invocations. Use the dev persona picker or email+password instead.
//   - The rate limiter is in-memory, so it is best-effort per instance.
//   - File uploads (KYC/photos/certificates) write to local disk, which is
//     read-only on Vercel, so those write endpoints will fail.
import { createApp } from '../server/bff.mjs';
import { loadConfig } from '../server/env.mjs';

const app = createApp(loadConfig());

export default function handler(req, res) {
  return app(req, res);
}
