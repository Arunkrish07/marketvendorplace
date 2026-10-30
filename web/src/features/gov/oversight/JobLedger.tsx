import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pagination } from '@/components/Pagination';
import { useFieldJobs } from './useField';
import { JobStatusPill } from './JobFieldDetail';

const PAGE_SIZE = 20;
const JOB_STATUSES = [
  'ASSIGNED', 'CHECKED_IN', 'SAMPLES_SEALED', 'IN_TRANSIT',
  'RECEIVED_AT_LAB', 'TESTING', 'COMPLETE', 'CANCELLED',
] as const;
const titleCase = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

function ResultCell({ state }: { state: 'pass' | 'fail' | 'none' }) {
  const { t } = useTranslation();
  if (state === 'pass') return <span className="font-medium text-good">{t('field.pass')}</span>;
  if (state === 'fail') return <span className="font-medium text-danger">{t('field.fail')}</span>;
  return <span className="text-slate">—</span>;
}

export function JobLedger({
  selectedJob, onSelectJob,
}: { selectedJob: string | null; onSelectJob: (id: string) => void }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [status]);
  const { data } = useFieldJobs(PAGE_SIZE, (page - 1) * PAGE_SIZE, status || undefined);
  const rows = data?.rows ?? [];

  return (
    <div className="gov-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h3 className="font-display text-base font-bold text-ink">{t('field.ledgerTitle')}</h3>
        <select
          aria-label={t('field.allStatuses')}
          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:border-brand focus:outline-none"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{t('field.allStatuses')}</option>
          {JOB_STATUSES.map((s) => (
            <option key={s} value={s}>{titleCase(s)}</option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-ink-3">
            <tr>
              <th className="px-6 py-3">{t('field.colJob')}</th>
              <th className="px-6 py-3">{t('field.colTechnician')}</th>
              <th className="px-6 py-3">{t('field.colStage')}</th>
              <th className="px-6 py-3">{t('field.colCheckin')}</th>
              <th className="px-6 py-3">{t('field.colResult')}</th>
              <th className="px-6 py-3">{t('field.colCert')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hair">
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`cursor-pointer ${selectedJob === r.id ? 'bg-brand-tint' : 'hover:bg-surface-2'}`}
                onClick={() => onSelectJob(r.id)}
              >
                <td className="px-6 py-3">
                  <span className="font-medium text-ink">{r.milestone}</span>
                  <span className="mt-0.5 block text-xs text-slate">{r.vendorName ?? r.orgName}</span>
                </td>
                <td className="px-6 py-3 text-xs text-slate">{r.technicianName ?? '—'}</td>
                <td className="px-6 py-3"><JobStatusPill status={r.status} /></td>
                <td className="px-6 py-3">{r.hasCheckin ? <span className="text-good">✓</span> : <span className="text-slate">—</span>}</td>
                <td className="px-6 py-3"><ResultCell state={r.resultState} /></td>
                <td className="px-6 py-3">{r.certified ? <span className="text-good">✓</span> : <span className="text-slate">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-4">
        <Pagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
      </div>
    </div>
  );
}
