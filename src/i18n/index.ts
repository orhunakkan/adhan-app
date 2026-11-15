// UI strings (brief §9 i18n). Arabic is RTL and uses Arabic-Indic digits.
import ar from './ar.json';
import en from './en.json';
import tr from './tr.json';
import type { PrayerName } from '../core/prayerTimes';

export const LANGS = ['tr', 'en', 'ar'] as const;
export type Lang = (typeof LANGS)[number];
export type MessageKey = keyof typeof en;

export const MESSAGES: Record<Lang, Record<MessageKey, string>> = { tr, en, ar };

/** BCP 47 tag for Intl formatting per UI language. */
export const INTL_LOCALE: Record<Lang, string> = { tr: 'tr', en: 'en', ar: 'ar-u-nu-arab' };

export function t(lang: Lang, key: MessageKey, vars: Record<string, string | number> = {}): string {
  return MESSAGES[lang][key].replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}

export function prayerName(lang: Lang, prayer: PrayerName): string {
  return t(lang, `prayer.${prayer}`);
}

/** Sets lang/dir on <html> so logical CSS properties mirror for Arabic. */
export function applyLocale(doc: Document, lang: Lang): void {
  doc.documentElement.lang = lang;
  doc.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}
