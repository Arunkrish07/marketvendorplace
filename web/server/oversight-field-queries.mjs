// Field-work oversight queries — the execution side of a job (check-in →
// sampling → custody → lab result → certificate). Every function runs under the
// caller's RLS session, so scope is enforced by the field_oversight_read policies
// (order.read holders, within their org). Mirrors oversight-queries.mjs.

const ACTIVE_STATUSES = "('ASSIGNED','CHECKED_IN','SAMPLES_SEALED','IN_TRANSIT','RECEIVED_AT_LAB')";
const POST_CHECKIN_STATUSES = "('IN_TRANSIT','RECEIVED_AT_LAB','TESTING','COMPLETE')";
const FAR_CHECKIN_M = 500;
const CLOCK_SKEW_S = 300;

// Per-job anomaly aggregates. Under RLS every row access re-evaluates the
// order→org→has_permission policy, which is ~1s even for a single row, so we
// must scan each table exactly once. MATERIALIZED forces that (PG12+ inlines
// CTEs by default, which made the planner re-scan under a nested loop — ~44s).
// A job with any check-in appears in `ci`; the LEFT JOIN's null then doubles as
// "missing check-in", so we never scan site_checkins twice. Shared with flags.
const ANOMALY_CTES = `
  ci as materialized (
    select job_id,
           bool_or(distance_m > ${FAR_CHECKIN_M})       as far,
           bool_or(abs(clock_skew_s) > ${CLOCK_SKEW_S})  as skew
      from eworks.site_checkins group by job_id
  ),
  rs as materialized (
    select job_id,
           bool_or(passed = false)  as failed,
           bool_or(is_provisional)  as provisional
      from eworks.test_results group by job_id
  )`;

export async function fieldSummary(client) {
  const { rows } = await client.query(`
    with ${ANOMALY_CTES}
    select
      count(*) filter (where j.status in ${ACTIVE_STATUSES})::int as "activeJobs",
      count(*) filter (where j.status = 'TESTING')::int          as "testingJobs",
      count(*) filter (where j.status = 'COMPLETE')::int         as "completeJobs",
      (select count(*)::int from eworks.test_results)            as "resultsEntered",
      (select count(*)::int from eworks.certificates)            as "certificatesIssued",
      count(*) filter (where
        coalesce(ci.far, false) or coalesce(ci.skew, false)
        or coalesce(rs.failed, false) or coalesce(rs.provisional, false)
        or (j.status in ${POST_CHECKIN_STATUSES} and ci.job_id is null))::int as "flaggedJobs"
    from eworks.test_jobs j
    left join ci on ci.job_id = j.id
    left join rs on rs.job_id = j.id
  `);
  const r = rows[0];
  return {
    activeJobs: r.activeJobs, testingJobs: r.testingJobs, completeJobs: r.completeJobs,
    resultsEntered: r.resultsEntered, certificatesIssued: r.certificatesIssued, flaggedJobs: r.flaggedJobs,
  };
}

export async function fieldJobs(client, { limit = 20, offset = 0, status = null, district = null } = {}) {
  const totalQ = await client.query(`
    select count(*)::int as total
      from eworks.test_jobs j
      join eworks.test_orders o on o.id = j.order_id
      join eworks.org_units ou on ou.id = o.org_unit_id
     where ($1::text is null or exists (
             select 1 from eworks.org_units d
              where d.level='DISTRICT' and d.path @> ou.path and d.name = $1))
       and ($2::text is null or j.status::text = $2::text)
  `, [district, status]);
  const q = await client.query(`
    select
      j.id, j.status,
      o.milestone,
      ou.name          as "orgName",
      v.legal_name     as "vendorName",
      tech.full_name   as "technicianName",
      exists(select 1 from eworks.site_checkins sc where sc.job_id = j.id) as "hasCheckin",
      case
        when exists(select 1 from eworks.test_results tr where tr.job_id=j.id and tr.passed = false) then 'fail'
        when exists(select 1 from eworks.test_results tr where tr.job_id=j.id and tr.passed = true)  then 'pass'
        else 'none'
      end as "resultState",
      exists(select 1 from eworks.certificates c where c.job_id = j.id) as "certified"
    from eworks.test_jobs j
    join eworks.test_orders o on o.id = j.order_id
    join eworks.org_units ou on ou.id = o.org_unit_id
    left join eworks.vendors v on v.id = j.vendor_id
    left join eworks.user_profiles tech on tech.id = j.technician_id
    where ($3::text is null or exists (
            select 1 from eworks.org_units d
             where d.level='DISTRICT' and d.path @> ou.path and d.name = $3))
      and ($4::text is null or j.status::text = $4::text)
    order by j.created_at desc
    limit $1 offset $2
  `, [limit, offset, district, status]);
  return { rows: q.rows, total: totalQ.rows[0].total };
}

export async function fieldFlags(client) {
  const { rows } = await client.query(`
    with j as materialized (
      select j.id, j.status, o.milestone, ou.name as org
        from eworks.test_jobs j
        join eworks.test_orders o on o.id = j.order_id
        join eworks.org_units ou on ou.id = o.org_unit_id
    ),
    ${ANOMALY_CTES}
    select "jobId", kind, severity, label from (
      select j.id as "jobId", 'far_checkin'        as kind, 'warn'      as severity, j.milestone || ' · ' || j.org as label
        from j join ci on ci.job_id = j.id where ci.far
      union all
      select j.id, 'clock_skew', 'warn', j.milestone || ' · ' || j.org
        from j join ci on ci.job_id = j.id where ci.skew
      union all
      select j.id, 'failed_result', 'integrity', j.milestone || ' · ' || j.org
        from j join rs on rs.job_id = j.id where rs.failed
      union all
      select j.id, 'provisional_result', 'warn', j.milestone || ' · ' || j.org
        from j join rs on rs.job_id = j.id where rs.provisional
      union all
      select j.id, 'missing_checkin', 'warn', j.milestone || ' · ' || j.org
        from j left join ci on ci.job_id = j.id
       where j.status in ${POST_CHECKIN_STATUSES} and ci.job_id is null
    ) f
    order by (severity = 'integrity') desc, label
    limit 100
  `);
  return rows;
}

export async function fieldJobDetail(client, jobId) {
  const jobQ = await client.query(`
    select j.id, j.status, o.milestone, ou.name as "orgName",
           v.legal_name as "vendorName", tech.full_name as "technicianName"
      from eworks.test_jobs j
      join eworks.test_orders o on o.id = j.order_id
      join eworks.org_units ou on ou.id = o.org_unit_id
      left join eworks.vendors v on v.id = j.vendor_id
      left join eworks.user_profiles tech on tech.id = j.technician_id
     where j.id = $1
  `, [jobId]);
  const job = jobQ.rows[0];
  if (!job) return null;

  const checkinQ = await client.query(`
    select reported_at as "reportedAt", accuracy_m as "accuracyM",
           distance_m as "distanceM", clock_skew_s as "clockSkewS",
           (photo_sha256 is not null) as "hasPhoto"
      from eworks.site_checkins where job_id = $1
     order by reported_at desc limit 1
  `, [jobId]);

  const custodyQ = await client.query(`
    select coc.event::text as event, coc.occurred_at as "occurredAt"
      from eworks.chain_of_custody coc
      join eworks.samples s on s.id = coc.sample_id
     where s.job_id = $1
     order by coc.occurred_at asc, coc.seq asc
  `, [jobId]);

  const resultsQ = await client.query(`
    select metric, metric_value as "metricValue",
           threshold_min as "thresholdMin", threshold_max as "thresholdMax",
           passed, is_provisional as "isProvisional"
      from eworks.test_results where job_id = $1
     order by entered_at asc
  `, [jobId]);

  const certQ = await client.query(`
    select issued_at as "issuedAt", signature_verified as "signatureVerified", signer_name as "signerName"
      from eworks.certificates where job_id = $1
     order by issued_at desc limit 1
  `, [jobId]);

  return {
    job: {
      id: job.id, status: job.status, milestone: job.milestone, orgName: job.orgName,
      vendorName: job.vendorName, technicianName: job.technicianName,
    },
    checkin: checkinQ.rows[0]
      ? {
          reportedAt: checkinQ.rows[0].reportedAt,
          accuracyM: checkinQ.rows[0].accuracyM == null ? null : Number(checkinQ.rows[0].accuracyM),
          distanceM: checkinQ.rows[0].distanceM == null ? null : Number(checkinQ.rows[0].distanceM),
          clockSkewS: checkinQ.rows[0].clockSkewS == null ? null : Number(checkinQ.rows[0].clockSkewS),
          hasPhoto: checkinQ.rows[0].hasPhoto,
        }
      : null,
    custody: custodyQ.rows.map((c) => ({ event: c.event, occurredAt: c.occurredAt })),
    results: resultsQ.rows.map((r) => ({
      metric: r.metric,
      metricValue: r.metricValue == null ? null : Number(r.metricValue),
      thresholdMin: r.thresholdMin == null ? null : Number(r.thresholdMin),
      thresholdMax: r.thresholdMax == null ? null : Number(r.thresholdMax),
      passed: r.passed,
      isProvisional: r.isProvisional,
    })),
    certificate: certQ.rows[0]
      ? { issuedAt: certQ.rows[0].issuedAt, signatureVerified: certQ.rows[0].signatureVerified, signerName: certQ.rows[0].signerName }
      : null,
  };
}
