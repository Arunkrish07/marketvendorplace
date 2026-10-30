// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import pg from 'pg';
import { fieldSummary, fieldJobs, fieldFlags, fieldJobDetail } from './oversight-field-queries.mjs';

// Force local PG before db.mjs loads (see oversight.db.test.mjs for the why).
process.env.EWORKS_USE_LOCAL_PG = '1';
process.env.PGHOST = process.env.PGHOST || '127.0.0.1';
process.env.PGPORT = process.env.PGPORT || '5433';
process.env.PGUSER = process.env.PGUSER || 'postgres';
process.env.PGPASSWORD = process.env.PGPASSWORD || 'postgres';
process.env.PGDATABASE = process.env.PGDATABASE || 'eworks';

const { withUserSession, pool } = await import('./db.mjs');

const probe = new pg.Pool({
  host: process.env.PGHOST, port: Number(process.env.PGPORT),
  user: process.env.PGUSER, password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE, connectionTimeoutMillis: 1500, max: 2,
});

let dbAvailable = false;
let headAdmin = null;
try {
  headAdmin = (await probe.query(
    `select user_id as "userId" from eworks.user_roles where role_code = 'HEAD_ADMIN' limit 1`)).rows[0] ?? null;
  dbAvailable = Boolean(headAdmin);
} catch { dbAvailable = false; }
const maybe = dbAvailable ? describe : describe.skip;

afterAll(async () => { await probe.end(); await pool.end(); });

// These queries scan RLS-guarded field tables (site_checkins/certificates cost
// ~1s per policy eval), so give them generous headroom over the 5s default.
maybe('field-work oversight', { timeout: 30000 }, () => {
  it('head admin can read scoped jobs after the field_oversight_read policy', async () => {
    const { total, rows } = await withUserSession(headAdmin.userId, (c) => fieldJobs(c, { limit: 5, offset: 0 }));
    expect(total).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(5);
    for (const r of rows) {
      expect(typeof r.milestone).toBe('string');
      expect(['pass', 'fail', 'none']).toContain(r.resultState);
      expect(typeof r.hasCheckin).toBe('boolean');
    }
  });

  it('the stage filter returns only that stage and is a subset', async () => {
    const all = await withUserSession(headAdmin.userId, (c) => fieldJobs(c, { limit: 500, offset: 0 }));
    const complete = await withUserSession(headAdmin.userId, (c) => fieldJobs(c, { limit: 500, offset: 0, status: 'COMPLETE' }));
    expect(complete.rows.every((r) => r.status === 'COMPLETE')).toBe(true);
    expect(complete.total).toBeLessThanOrEqual(all.total);
  });

  it('summary counts are non-negative integers', async () => {
    const s = await withUserSession(headAdmin.userId, (c) => fieldSummary(c));
    for (const v of Object.values(s)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('flags carry a job id, a known severity, and a label', async () => {
    const flags = await withUserSession(headAdmin.userId, (c) => fieldFlags(c));
    for (const f of flags) {
      expect(typeof f.jobId).toBe('string');
      expect(['warn', 'integrity']).toContain(f.severity);
      expect(typeof f.label).toBe('string');
    }
  });

  it('job detail returns the expected shape for a real job', async () => {
    const { rows } = await withUserSession(headAdmin.userId, (c) => fieldJobs(c, { limit: 1, offset: 0 }));
    if (!rows[0]) return;
    const d = await withUserSession(headAdmin.userId, (c) => fieldJobDetail(c, rows[0].id));
    expect(d.job.id).toBe(rows[0].id);
    expect(Array.isArray(d.custody)).toBe(true);
    expect(Array.isArray(d.results)).toBe(true);
  });
});
