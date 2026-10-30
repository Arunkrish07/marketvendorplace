import { useTranslation } from 'react-i18next';
import { StatusPill } from '@/components/StatusPill';
import type { FieldJobStatus } from '@/types/domain';
import { useFieldJob } from './useField';

const JOB_TONE: Record<FieldJobStatus, 'accent' | 'warn' | 'good' | 'neutral' | 'danger'> = {
  ASSIGNED: 'neutral',
  CHECKED_IN: 'accent',
  SAMPLES_SEALED: 'accent',
  IN_TRANSIT: 'accent',
  RECEIVED_AT_LAB: 'accent',
  TESTING: 'warn',
  COMPLETE: 'good',
  CANCELLED: 'neutral',
};

export function JobStatusPill({ status }: { status: FieldJobStatus }) {
  return <StatusPill tone={JOB_TONE[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</StatusPill>;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString();

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-ink-3">{label}</span>
      <span className="text-right text-sm text-ink">{value}</span>
    </div>
  );
}

export function JobFieldDetail({ jobId }: { jobId: string }) {
  const { t } = useTranslation();
  const { data, isPending } = useFieldJob(jobId);

  if (isPending || !data) return <div className="gov-card p-6 text-sm text-slate">{t('states.loading')}</div>;

  const { job, checkin, custody, results, certificate } = data;

  return (
    <div className="gov-card overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-base font-bold text-ink">{job.milestone}</h3>
          <JobStatusPill status={job.status} />
        </div>
        <p className="mt-0.5 text-xs text-ink-3">{job.orgName}</p>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div>
          <Row label={t('field.vendor')} value={job.vendorName ?? '—'} />
          <Row label={t('field.technician')} value={job.technicianName ?? '—'} />
        </div>

        <section>
          <p className="gov-label mb-1">{t('field.checkin')}</p>
          {checkin ? (
            <div className="rounded-lg border border-line px-3 py-2">
              <Row label={t('field.checkinAt')} value={fmtDate(checkin.reportedAt)} />
              <Row
                label={t('field.distance')}
                value={
                  checkin.distanceM == null ? '—' : (
                    <span className={checkin.distanceM > 500 ? 'font-semibold text-danger' : ''}>
                      {Math.round(checkin.distanceM)} m
                    </span>
                  )
                }
              />
              <Row label={t('field.accuracy')} value={checkin.accuracyM == null ? '—' : `${Math.round(checkin.accuracyM)} m`} />
              <Row
                label={t('field.clockSkew')}
                value={
                  checkin.clockSkewS == null ? '—' : (
                    <span className={Math.abs(checkin.clockSkewS) > 300 ? 'font-semibold text-danger' : ''}>
                      {Math.round(checkin.clockSkewS)} s
                    </span>
                  )
                }
              />
              <Row label={t('field.photo')} value={checkin.hasPhoto ? t('field.yes') : t('field.no')} />
            </div>
          ) : (
            <p className="text-sm text-slate">{t('field.noCheckin')}</p>
          )}
        </section>

        <section>
          <p className="gov-label mb-1">{t('field.custody')}</p>
          {custody.length ? (
            <ol className="space-y-1">
              {custody.map((c, i) => (
                <li key={`${c.event}-${i}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-ink">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
                    {c.event.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-ink-3">{fmtDate(c.occurredAt)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate">{t('field.noCustody')}</p>
          )}
        </section>

        <section>
          <p className="gov-label mb-1">{t('field.results')}</p>
          {results.length ? (
            <ul className="space-y-1">
              {results.map((r, i) => (
                <li key={`${r.metric}-${i}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink">
                    {r.metric}
                    {r.isProvisional && <span className="ml-1 text-[10px] uppercase text-warn">{t('field.provisional')}</span>}
                  </span>
                  <span className={`font-medium ${r.passed ? 'text-good' : 'text-danger'}`}>
                    {r.metricValue ?? '—'} · {r.passed ? t('field.pass') : t('field.fail')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate">{t('field.noResults')}</p>
          )}
        </section>

        <section>
          <p className="gov-label mb-1">{t('field.certificate')}</p>
          {certificate ? (
            <div className="rounded-lg border border-line px-3 py-2">
              <Row label={t('field.issuedAt')} value={fmtDate(certificate.issuedAt)} />
              <Row
                label={t('field.signature')}
                value={
                  <span className={certificate.signatureVerified ? 'text-good' : 'text-danger'}>
                    {certificate.signatureVerified ? t('field.verified') : t('field.unverified')}
                  </span>
                }
              />
            </div>
          ) : (
            <p className="text-sm text-slate">{t('field.noCertificate')}</p>
          )}
        </section>
      </div>
    </div>
  );
}
