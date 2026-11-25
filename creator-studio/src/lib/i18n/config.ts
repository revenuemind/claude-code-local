/** Interface languages. Independent from the language of generated content. */
export const LOCALES = ['en', 'he', 'ru', 'ar', 'am'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'cs_locale';

export const RTL_LOCALES: ReadonlySet<Locale> = new Set(['he', 'ar']);
export const dirOf = (l: Locale): 'rtl' | 'ltr' => (RTL_LOCALES.has(l) ? 'rtl' : 'ltr');

/** Native names shown in the language switcher. */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', he: 'עברית', ru: 'Русский', ar: 'العربية', am: 'አማርኛ' };

/** BCP-47 tags for Intl formatting. */
export const INTL_TAGS: Record<Locale, string> = { en: 'en-US', he: 'he-IL', ru: 'ru-RU', ar: 'ar', am: 'am-ET' };

export function isLocale(x: unknown): x is Locale {
  return typeof x === 'string' && (LOCALES as readonly string[]).includes(x);
}

export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  for (const part of acceptLanguage.split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase().slice(0, 2);
    if (tag === 'iw') return 'he';
    if (isLocale(tag)) return tag;
  }
  return DEFAULT_LOCALE;
}

/** Content languages offered for generated videos (UI language is separate). */
export const CONTENT_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', he: 'עברית (Hebrew)', ru: 'Русский (Russian)', ar: 'العربية (Arabic)', am: 'አማርኛ (Amharic)',
  es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português', it: 'Italiano', tr: 'Türkçe', uk: 'Українська',
};
