import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pagination } from '@/components/Pagination';
import { OrderStatusPill } from '@/features/orders/OrderStatusPill';
import type { FinanceDistrictRow } from '@/types/domain';
import { useFinanceOrders } from './useOversight';
import { formatPaise } from './financeModel';
import { financeExportUrl } from './oversightApi';

const PAGE_SIZE = 20;
const ORDER_STATUSES = ['DRAFT', 'FLOATED', 'REVEALING', 'AWARDED', 'CANCELLED', 'FAILED'] as const;
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const SELECT_CLASS =
  'rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:border-brand focus:outline-none';

export function OrderLedger({
  districtFilter, onDistrictFilter, districts, selectedOrder, onSelectOrder,
}: {
  districtFilter: string;
  onDistrictFilter: (district: string) => void;
  districts: FinanceDistrictRow[];
  selectedOrder: string | null;
  onSelectOrder: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  // Any filter change returns to the first page so the view is never stranded on
  // an out-of-range page.
  useEffect(() => setPage(1), [districtFilter, status]);
  const { data } = useFinanceOrders(
    PAGE_SIZE,
    (page - 1) * PAGE_SIZE,
    districtFilter || undefined,
    status || undefined,
  );
  const rows = data?.rows ?? [];

  // Just the ledger card: the selected-order detail now lives in the page's
  // sticky right rail (see FinanceOverview), so it stays visible for both the
  // flags panel and this table.
  return (
    <div className="gov-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h3 className="font-display text-base font-bold text-ink">{t('oversight.ledgerTitle')}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t('oversight.filterAllStatuses')}
            className={SELECT_CLASS}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{t('oversight.filterAllStatuses')}</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>{titleCase(s)}</option>
            ))}
          </select>
          <select
            aria-label={t('oversight.filterAllDistricts')}
            className={SELECT_CLASS}
            value={districtFilter}
            onChange={(e) => onDistrictFilter(e.target.value)}
          >
            <option value="">{t('oversight.filterAllDistricts')}</option>
            {districts.map((d) => (
              <option key={d.districtId} value={d.district}>{d.district}</option>
            ))}
          </select>
          <a className="gov-btn-secondary text-xs" href={financeExportUrl('orders')} download>
            {t('oversight.exportCsv')}
          </a>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-ink-3">
            <tr>
              <th className="px-6 py-3">{t('oversight.colOrder')}</th>
              <th className="px-6 py-3">{t('oversight.colStatus')}</th>
              <th className="px-6 py-3">{t('oversight.colEstimate')}</th>
              <th className="px-6 py-3">{t('oversight.colBids')}</th>
              <th className="px-6 py-3">{t('oversight.colAward')}</th>
              <th className="px-6 py-3">{t('oversight.colPayment')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hair">
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`cursor-pointer ${selectedOrder === r.id ? 'bg-brand-tint' : 'hover:bg-surface-2'}`}
                onClick={() => onSelectOrder(r.id)}
              >
                <td className="px-6 py-3">
                  <span className="font-medium text-ink">{r.milestone}</span>
                  <span className="mt-0.5 block text-xs text-slate">{r.orgName}</span>
                </td>
                <td className="px-6 py-3"><OrderStatusPill status={r.status} /></td>
                <td className="px-6 py-3 tabular-nums">{formatPaise(r.estimatePaise)}</td>
                <td className="px-6 py-3 tabular-nums">{r.bidCount}</td>
                <td className="px-6 py-3 tabular-nums">{r.awardPaise == null ? t('oversight.sealed') : formatPaise(r.awardPaise)}</td>
                <td className="px-6 py-3 text-xs text-slate">{r.paymentStatus ?? '—'}</td>
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
