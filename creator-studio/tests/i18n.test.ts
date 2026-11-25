import { describe, expect, it } from 'vitest';
import { DICTS, makeT, lookup } from '../src/lib/i18n';
import { LOCALES, dirOf, negotiateLocale, isLocale } from '../src/lib/i18n/config';
import { TEMPLATES } from '../src/lib/templates/library';
import { PHRASES } from '../src/lib/templates/phrases';

function leaves(o: unknown, prefix = ''): Array<[string, string]> {
  if (typeof o === 'string') return [[prefix, o]];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n dictionaries', () => {
  const en = new Map(leaves(DICTS.en));

  it('every locale has exactly the English keys', () => {
    for (const l of LOCALES) {
      const keys = new Set(leaves(DICTS[l]).map(([k]) => k));
      expect([...en.keys()].filter((k) => !keys.has(k)), `${l} missing`).toEqual([]);
      expect([...keys].filter((k) => !en.has(k)), `${l} extra`).toEqual([]);
    }
  });

  it('no empty strings and placeholders preserved', () => {
    for (const l of LOCALES) {
      for (const [k, v] of leaves(DICTS[l])) {
        expect(v.trim().length, `${l}:${k}`).toBeGreaterThan(0);
        expect(placeholders(v), `${l}:${k}`).toEqual(placeholders(en.get(k)!));
      }
    }
  });

  it('non-English dictionaries are actually translated (most strings differ from English)', () => {
    for (const l of LOCALES.filter((x) => x !== 'en')) {
      const all = leaves(DICTS[l]);
      const same = all.filter(([k, v]) => v === en.get(k) && !/^[A-Z0-9 ().,:·/\-–—]+$/.test(v));
      expect(same.length / all.length, `${l} untranslated ratio`).toBeLessThan(0.08);
    }
  });

  it('direction, negotiation and interpolation', () => {
    expect(dirOf('he')).toBe('rtl'); expect(dirOf('ar')).toBe('rtl');
    expect(dirOf('en')).toBe('ltr'); expect(dirOf('ru')).toBe('ltr'); expect(dirOf('am')).toBe('ltr');
    expect(negotiateLocale('iw-IL,en;q=0.5')).toBe('he');
    expect(negotiateLocale('am-ET')).toBe('am');
    expect(negotiateLocale('fr-FR')).toBe('en');
    expect(isLocale('ru')).toBe(true); expect(isLocale('xx')).toBe(false);
    expect(makeT('he')('dashboard.greeting', { name: 'דנה' })).toBe('שלום, דנה');
    expect(makeT('en')('missing.key')).toBe('missing.key');
    expect(lookup(DICTS.ar, 'nav.templates')).toBe('القوالب');
  });

  it('template names and descriptions are localized in all 5 UI languages', () => {
    for (const t of TEMPLATES) for (const l of LOCALES) {
      expect((t.name as Record<string, string>)[l], `${t.id} name ${l}`).toBeTruthy();
      expect((t.description as Record<string, string>)[l], `${t.id} description ${l}`).toBeTruthy();
    }
  });

  it('content phrases exist in every UI language', () => {
    for (const [k, p] of Object.entries(PHRASES)) for (const l of LOCALES) expect((p as Record<string, string>)[l], `${k}:${l}`).toBeTruthy();
  });
});
