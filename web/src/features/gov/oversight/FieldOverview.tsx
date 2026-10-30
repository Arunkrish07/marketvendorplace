import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FeedSkeleton } from '@/components/Skeleton';
import { useFieldSummary } from './useField';
import { FieldFlagsPanel } from './FieldFlagsPanel';
import { JobLedger } from './JobLedger';
import { JobFieldDetail } from './JobFieldDetail';

export function FieldOverview() {
  const { t } = useTranslation();
  const { data: summary, isPending, isError, refetch } = useFieldSummary();
  const [selectedJob, setSelectedJob] = useState<string | null>(null);

  if (isError) {
    return (
      <div className="gov-card border-l-4 border-l-danger p-6 text-center">
        <p className="font-semibold text-danger">{t('states.errorTitle')}</p>
        <button type="button" onClick={() => void refetch()} className="gov-btn-secondary mt-4">
          {t('states.retry')}
        </button>
      </div>
    );
  }

  if (isPending || !summary) return <FeedSkeleton />;

  const kpis: [string, string][] = [
    [t('field.kpiActive'), String(summary.activeJobs)],
    [t('field.kpiTesting'), String(summary.testingJobs)],
    [t('field.kpiComplete'), String(summary.completeJobs)],
    [t('field.kpiResults'), String(summary.resultsEntered)],
    [t('field.kpiCerts'), String(summary.certificatesIssued)],
    [t('field.kpiFlagged'), String(summary.flaggedJobs)],
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map(([label, value]) => (
          <div key={label} className="gov-card p-3">
            <p className="gov-label">{label}</p>
            <p className="mt-1 font-display text-xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="min-w-0">
          <JobLedger selectedJob={selectedJob} onSelectJob={setSelectedJob} />
        </div>

        <aside className="space-y-6 xl:sticky xl:top-4">
          <FieldFlagsPanel onSelectJob={setSelectedJob} />
          {selectedJob ? (
            <JobFieldDetail jobId={selectedJob} />
          ) : (
            <div className="gov-card p-6 text-center text-sm text-slate">{t('field.selectJob')}</div>
          )}
        </aside>
      </div>
    </div>
  );
}
