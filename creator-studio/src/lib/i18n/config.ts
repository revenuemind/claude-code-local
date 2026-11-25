export const LOCALES = ['en', 'he', 'ru', 'ar', 'am'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'cs_locale';

export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', he: 'עברית', ru: 'Русский', ar: 'العربية', am: 'አማርኛ' };
/** BCP-47 tags used for Intl date/number formatting. */
export const INTL_LOCALE: Record<Locale, string> = { en: 'en-US', he: 'he-IL', ru: 'ru-RU', ar: 'ar', am: 'am-ET' };

export function isLocale(x: unknown): x is Locale {
  return typeof x === 'string' && (LOCALES as readonly string[]).includes(x);
}

export function dirOf(locale: string): 'rtl' | 'ltr' {
  return locale === 'he' || locale === 'ar' ? 'rtl' : 'ltr';
}

/** Pick the best supported locale from an Accept-Language header. */
export function negotiate(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  for (const part of acceptLanguage.split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase();
    const base = tag.split('-')[0] === 'iw' ? 'he' : tag.split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** Languages a video can be generated in (independent of the UI language). */
export const CONTENT_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', he: 'עברית', ru: 'Русский', ar: 'العربية', am: 'አማርኛ', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português', it: 'Italiano', tr: 'Türkçe', uk: 'Українська',
};
