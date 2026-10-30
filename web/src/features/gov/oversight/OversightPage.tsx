import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FinanceOverview } from './FinanceOverview';
import { FieldOverview } from './FieldOverview';

type Tab = 'finance' | 'field';

export function OversightPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('finance');

  return (
    <section className="space-y-6">
      <header>
        <h2 className="font-display text-xl font-bold">{t('oversight.title')}</h2>
        <p className="mt-1 text-sm text-ink-2">{t('oversight.subtitle')}</p>
      </header>

      <div className="flex gap-2 border-b border-line">
        <button
          type="button"
          onClick={() => setTab('finance')}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
            tab === 'finance' ? 'border-brand text-brand' : 'border-transparent text-slate hover:text-ink'
          }`}
        >
          {t('oversight.tabFinance')}
        </button>
        <button
          type="button"
          onClick={() => setTab('field')}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
            tab === 'field' ? 'border-brand text-brand' : 'border-transparent text-slate hover:text-ink'
          }`}
        >
          {t('oversight.tabField')}
        </button>
      </div>

      {tab === 'finance' && <FinanceOverview />}
      {tab === 'field' && <FieldOverview />}
    </section>
  );
}
