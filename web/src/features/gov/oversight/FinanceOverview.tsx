import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FeedSkeleton } from '@/components/Skeleton';
import { Pagination } from '@/components/Pagination';
import { useFinanceSummary, useFinanceDistricts } from './useOversight';
import { formatPaise } from './financeModel';
import { financeExportUrl } from './oversightApi';
import { FlagsPanel } from './FlagsPanel';
import { OrderLedger } from './OrderLedger';
import { OrderFinanceDetail } from './OrderFinanceDetail';
import { VendorEarningsLens } from './VendorEarningsLens';

export function FinanceOverview() {
  const { t } = useTranslation();
  const { data: summary, isPending, isError, refetch } = useFinanceSummary();
  const { data: districts = [] } = useFinanceDistricts();
  const [districtFilter, setDistrictFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);

  // The district set is bounded (~37), so search + paging is done client-side.
  const [districtQuery, setDistrictQuery] = useState('');
  const [districtPage, setDistrictPage] = useState(1);
  const DISTRICT_PAGE_SIZE = 10;
  const filteredDistricts = useMemo(
    () => districts.filter((d) => d.district.toLowerCase().includes(districtQuery.trim().toLowerCase())),
    [districts, districtQuery],
  );
  useEffect(() => setDistrictPage(1), [districtQuery]);
  const pagedDistricts = filteredDistricts.slice(
    (districtPage - 1) * DISTRICT_PAGE_SIZE,
    districtPage * DISTRICT_PAGE_SIZE,
  );

  // A failed fetch must read as an error, not a perpetual skeleton — otherwise a
  // transient backend blip looks like a permanent hang. Mirrors the error+retry
  // pattern used by the other gov screens.
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
    [t('oversight.kpiFloated'), `${summary.floatedCount} · ${formatPaise(summary.floatedEstimatePaise)}`],
    [t('oversight.kpiBids'), String(summary.bidsReceived)],
    [t('oversight.kpiAwarded'), formatPaise(summary.awardedValuePaise)],
    [t('oversight.kpiSavings'), formatPaise(summary.savingsPaise)],
    [t('oversight.kpiHeld'), formatPaise(summary.paymentsHeldPaise)],
    [t('oversight.kpiReleased'), formatPaise(summary.paymentsReleasedPaise)],
    [t('oversight.kpiFailed'), formatPaise(summary.failedValuePaise)],
  ];

  return (
    <div className="space-y-6">
      {/* Compact KPI strip: seven figures on one row on wide screens. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {kpis.map(([label, value]) => (
          <div key={label} className="gov-card p-3">
            <p className="gov-label">{label}</p>
            <p className="mt-1 font-display text-xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* Two-pane: wide tables on the left, a sticky rail (flags + the selected
          order's detail) on the right so it stays visible while the tables scroll. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="min-w-0 space-y-6">
          <div className="gov-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <h3 className="font-display text-base font-bold text-ink">{t('oversight.colDistrict')}</h3>
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  value={districtQuery}
                  onChange={(e) => setDistrictQuery(e.target.value)}
                  placeholder={t('oversight.filterDistrictSearch')}
                  aria-label={t('oversight.filterDistrictSearch')}
                  className="w-44 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink focus:border-brand focus:outline-none"
                />
                <a className="gov-btn-secondary text-xs" href={financeExportUrl('districts')} download>
                  {t('oversight.exportCsv')}
                </a>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-2 text-xs uppercase tracking-wider text-ink-3">
                  <tr>
                    <th className="px-6 py-3">{t('oversight.colDistrict')}</th>
                    <th className="px-6 py-3">{t('oversight.colFloated')}</th>
                    <th className="px-6 py-3">{t('oversight.colAwarded')}</th>
                    <th className="px-6 py-3">{t('oversight.colSavings')}</th>
                    <th className="px-6 py-3">{t('oversight.colHeld')}</th>
                    <th className="px-6 py-3">{t('oversight.colReleased')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hair">
                  {pagedDistricts.map((d) => (
                    <tr
                      key={d.districtId}
                      className={`cursor-pointer ${districtFilter === d.district ? 'bg-brand-tint' : 'hover:bg-surface-2'}`}
                      onClick={() => setDistrictFilter((cur) => (cur === d.district ? '' : d.district))}
                    >
                      <td className="px-6 py-3 font-medium text-ink">{d.district}</td>
                      <td className="px-6 py-3 tabular-nums">{d.floatedCount}</td>
                      <td className="px-6 py-3 tabular-nums">{formatPaise(d.awardedValuePaise)}</td>
                      <td className="px-6 py-3 tabular-nums">{formatPaise(d.savingsPaise)}</td>
                      <td className="px-6 py-3 tabular-nums">{formatPaise(d.paymentsHeldPaise)}</td>
                      <td className="px-6 py-3 tabular-nums">{formatPaise(d.paymentsReleasedPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4">
              <Pagination
                total={filteredDistricts.length}
                page={districtPage}
                pageSize={DISTRICT_PAGE_SIZE}
                onPage={setDistrictPage}
              />
            </div>
          </div>

          <OrderLedger
            districtFilter={districtFilter}
            onDistrictFilter={setDistrictFilter}
            districts={districts}
            selectedOrder={selectedOrder}
            onSelectOrder={setSelectedOrder}
          />

          <VendorEarningsLens />
        </div>

        <aside className="space-y-6 xl:sticky xl:top-4">
          <FlagsPanel onSelectOrder={setSelectedOrder} />
          {selectedOrder ? (
            <OrderFinanceDetail orderId={selectedOrder} />
          ) : (
            <div className="gov-card p-6 text-center text-sm text-slate">{t('oversight.empty')}</div>
          )}
        </aside>
      </div>
    </div>
  );
}
