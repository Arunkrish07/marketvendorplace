-- Field-work oversight: let read-only oversight roles (order.read holders) see
-- the execution trail for jobs within their org scope — jobs, check-ins, results,
-- certificates, and sample custody.
--
-- The existing *_read policies scope these tables to the vendor/technician who
-- owns the job, so gov officers saw nothing. This mirrors orders_officer_read:
-- a parallel, permission-gated SELECT policy that joins each row back to its
-- order's org_unit and checks has_permission('order.read', ou.path). RLS policies
-- are OR-ed, so this only grants; it cannot widen the vendor/technician policies.

create policy jobs_oversight_read on eworks.test_jobs
  for select to eworks_authenticated
  using (exists (
    select 1 from eworks.test_orders o
      join eworks.org_units ou on ou.id = o.org_unit_id
     where o.id = test_jobs.order_id
       and eworks.has_permission('order.read', ou.path)
  ));

create policy checkins_oversight_read on eworks.site_checkins
  for select to eworks_authenticated
  using (exists (
    select 1 from eworks.test_jobs j
      join eworks.test_orders o on o.id = j.order_id
      join eworks.org_units ou on ou.id = o.org_unit_id
     where j.id = site_checkins.job_id
       and eworks.has_permission('order.read', ou.path)
  ));

create policy results_oversight_read on eworks.test_results
  for select to eworks_authenticated
  using (exists (
    select 1 from eworks.test_jobs j
      join eworks.test_orders o on o.id = j.order_id
      join eworks.org_units ou on ou.id = o.org_unit_id
     where j.id = test_results.job_id
       and eworks.has_permission('order.read', ou.path)
  ));

create policy certificates_oversight_read on eworks.certificates
  for select to eworks_authenticated
  using (exists (
    select 1 from eworks.test_jobs j
      join eworks.test_orders o on o.id = j.order_id
      join eworks.org_units ou on ou.id = o.org_unit_id
     where j.id = certificates.job_id
       and eworks.has_permission('order.read', ou.path)
  ));

create policy custody_oversight_read on eworks.chain_of_custody
  for select to eworks_authenticated
  using (exists (
    select 1 from eworks.samples s
      join eworks.test_jobs j on j.id = s.job_id
      join eworks.test_orders o on o.id = j.order_id
      join eworks.org_units ou on ou.id = o.org_unit_id
     where s.id = chain_of_custody.sample_id
       and eworks.has_permission('order.read', ou.path)
  ));
