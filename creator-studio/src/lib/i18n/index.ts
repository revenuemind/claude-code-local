import en, { type Dict } from './dict/en';
import he from './dict/he';
import ru from './dict/ru';
import ar from './dict/ar';
import am from './dict/am';
import { INTL_TAGS, type Locale } from './config';

export const DICTS: Record<Locale, Dict> = { en, he, ru, ar, am };
export type { Dict };

type Paths<T, P extends string = ''> = T extends string
  ? P
  : { [K in keyof T & string]: Paths<T[K], P extends '' ? K : `${P}.${K}`> }[keyof T & string];
export type TKey = Paths<Dict>;

export function lookup(dict: Dict, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function makeT(locale: Locale) {
  const dict = DICTS[locale] ?? en;
  return (key: TKey | string, vars?: Record<string, string | number>): string => {
    let s = lookup(dict, key) ?? lookup(en, key) ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

export function formatDate(locale: Locale, d: Date | string | number, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string {
  return new Intl.DateTimeFormat(INTL_TAGS[locale], opts).format(new Date(d));
}

export function formatNumber(locale: Locale, n: number, opts: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(INTL_TAGS[locale], opts).format(n);
}

export function formatCurrency(locale: Locale, usd: number): string {
  return new Intl.NumberFormat(INTL_TAGS[locale], { style: 'currency', currency: 'USD', maximumFractionDigits: usd < 1 ? 3 : 2 }).format(usd);
}

export function formatDuration(locale: Locale, seconds: number): string {
  const m = Math.floor(seconds / 60); const s = Math.round(seconds % 60);
  return m ? `${formatNumber(locale, m)}:${String(s).padStart(2, '0')}` : `${formatNumber(locale, s)}${lookup(DICTS[locale], 'common.seconds') ?? 's'}`;
}
