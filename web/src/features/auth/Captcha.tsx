import { useTranslation } from 'react-i18next';
import { RotateCw, ShieldCheck } from 'lucide-react';

/**
 * The sign-in challenge. The <img> is itself the endpoint: requesting it draws a
 * fresh code and sets the HttpOnly cookie the server checks at login (see
 * server/captcha.mjs). `nonce` busts the cache so the refresh button — and a
 * failed login — pull a brand-new code rather than the cached image.
 */
export function Captcha({
  value,
  onChange,
  nonce,
  onRefresh,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  nonce: number;
  onRefresh: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <img
        src={`/api/auth/captcha?r=${nonce}`}
        alt={t('signInEmail.captchaAlt')}
        className="h-12 w-[150px] shrink-0 rounded-xl border border-line bg-surface-2 object-contain"
        width={150}
        height={48}
      />
      <button
        type="button"
        onClick={onRefresh}
        disabled={disabled}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-slate transition hover:bg-surface-2 hover:text-ink disabled:opacity-60"
        aria-label={t('signInEmail.captchaRefresh')}
      >
        <RotateCw className="h-4 w-4" />
      </button>
      <div className="sign-in-field relative flex-1">
        <ShieldCheck className="sign-in-field-icon" aria-hidden="true" />
        <input
          id="captcha"
          name="captcha"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('signInEmail.captchaPlaceholder')}
          required
          aria-label={t('signInEmail.captchaLabel')}
          className="sign-in-input sign-in-input-pill sign-in-input-iconed uppercase tracking-[0.2em] placeholder:normal-case placeholder:tracking-normal"
        />
      </div>
    </div>
  );
}
