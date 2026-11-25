'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DICTS, makeT, formatDate, formatNumber, formatCurrency, formatDuration, type TKey } from '@/lib/i18n';
import { dirOf, type Locale } from '@/lib/i18n/config';

interface I18n {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  t: (key: TKey | string, vars?: Record<string, string | number>) => string;
  date: (d: Date | string | number, opts?: Intl.DateTimeFormatOptions) => string;
  num: (n: number, opts?: Intl.NumberFormatOptions) => string;
  usd: (n: number) => string;
  dur: (seconds: number) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18n>(() => ({
    locale, dir: dirOf(locale), t: makeT(locale),
    date: (d, o) => formatDate(locale, d, o), num: (n, o) => formatNumber(locale, n, o), usd: (n) => formatCurrency(locale, n), dur: (s) => formatDuration(locale, s),
  }), [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}

export { DICTS };
