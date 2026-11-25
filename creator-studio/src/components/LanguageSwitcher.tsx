'use client';
import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/lib/i18n/config';
import { useI18n } from './I18nProvider';
import { apiFetch } from '@/lib/client/api';

export function LanguageSwitcher({ compact }: { compact?: boolean }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const change = async (l: Locale) => {
    await apiFetch('/api/locale', { body: { locale: l } }).catch(() => {});
    document.documentElement.lang = l;
    router.refresh();
  };
  return (
    <label className="flex items-center gap-2 text-xs text-mute">
      {!compact && <span aria-hidden>🌐</span>}
      <span className="sr-only">{t('common.language')}</span>
      <select className="field !w-auto !py-1.5 text-xs" value={locale} onChange={(e) => change(e.target.value as Locale)} data-testid="language-switcher">
        {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
      </select>
    </label>
  );
}
