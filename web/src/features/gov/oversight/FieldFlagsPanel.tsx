import { useTranslation } from 'react-i18next';
import { useFieldFlags } from './useField';
import type { FieldFlag } from '@/types/domain';

const LABEL_KEY: Record<string, string> = {
  far_checkin: 'field.flagFarCheckin',
  clock_skew: 'field.flagClockSkew',
  missing_checkin: 'field.flagMissingCheckin',
  failed_result: 'field.flagFailedResult',
  provisional_result: 'field.flagProvisional',
};

export function FieldFlagsPanel({ onSelectJob }: { onSelectJob: (id: string) => void }) {
  const { t } = useTranslation();
  const { data: flags = [] } = useFieldFlags();

  return (
    <div className="gov-card p-4">
      <h3 className="font-display text-base font-bold text-ink">{t('oversight.flagsTitle')}</h3>
      {flags.length === 0 ? (
        <p className="mt-2 text-sm text-slate">{t('oversight.flagsEmpty')}</p>
      ) : (
        <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto">
          {flags.map((f: FieldFlag, i) => (
            <li key={`${f.kind}-${f.jobId}-${i}`}>
              <button
                type="button"
                onClick={() => onSelectJob(f.jobId)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm ${
                  f.severity === 'integrity'
                    ? 'border-danger bg-danger-soft text-danger'
                    : 'border-warn bg-warn-soft text-ink'
                }`}
              >
                <span className="font-medium">{t(LABEL_KEY[f.kind] ?? 'oversight.flagsTitle')}</span>
                <span className="truncate text-xs text-slate">{f.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
