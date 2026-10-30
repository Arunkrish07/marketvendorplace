import { useTranslation } from 'react-i18next';
import { TnEmblem } from '@/components/TnEmblem';
import { EmailSignIn } from '@/features/auth/EmailSignIn';

export function DevSignIn() {
  const { t } = useTranslation();

  return (
    <div className="sign-in-root">
      <div className="sign-in-card">
        {/* Left image "box": photo background (swap web/public/sign-in-bg.jpg)
            with the branding overlaid — emblem, title, and hero copy. */}
        <section className="sign-in-hero" aria-label={t('dev.signInTitle')}>
          <div className="sign-in-hero-scrim" aria-hidden="true" />

          <div className="relative z-10 sign-in-fade-up">
            <div className="gov-stripe mb-6 max-w-[120px] rounded-full" aria-hidden="true" />
            <div className="flex items-center gap-4">
              <TnEmblem tone="onDark" className="h-14 sm:h-16" />
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/85">
                  {t('app.subtitle')}
                </p>
                <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                  {t('app.brand')}
                </h1>
              </div>
            </div>
          </div>

          <div className="relative z-10 sign-in-fade-up sign-in-fade-up-d1">
            <h2 className="font-display text-2xl font-bold leading-tight sm:text-3xl">
              {t('signIn.heroTitle')}
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85 sm:text-base">
              {t('signIn.heroDesc')}
            </p>
            <p className="mt-6 text-xs text-white/60">{t('signIn.footer')}</p>
          </div>
        </section>

        <section className="sign-in-panel">
          <div className="flex min-h-0 flex-1 flex-col justify-center px-6 py-10 sm:px-10 sm:py-12 lg:px-14">
            <div className="sign-in-slide-in mx-auto w-full max-w-md">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">
                {t('dev.signInTitle')}
              </p>
              {/* Title and helper copy live in EmailSignIn so the heading matches
                  the step being shown (credentials vs second factor). */}
              <div className="mt-4">
                <EmailSignIn />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
