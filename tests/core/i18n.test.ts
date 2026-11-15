import { describe, expect, it } from 'vitest';
import { INTL_LOCALE, LANGS, MESSAGES, prayerName, t } from '../../src/i18n';
import { PRAYERS } from '../../src/core/prayerTimes';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n completeness', () => {
  const en = Object.keys(MESSAGES.en).sort();

  it.each(LANGS)('%s has exactly the same keys as en', (lang) => {
    expect(Object.keys(MESSAGES[lang]).sort()).toEqual(en);
  });

  it.each(LANGS)('%s has no empty strings', (lang) => {
    for (const [k, v] of Object.entries(MESSAGES[lang])) expect(v.trim(), k).not.toBe('');
  });

  it.each(LANGS)('%s uses the same interpolation placeholders as en', (lang) => {
    for (const k of en) {
      expect(placeholders(MESSAGES[lang][k as keyof typeof MESSAGES.en]), `${lang}:${k}`).toEqual(
        placeholders(MESSAGES.en[k as keyof typeof MESSAGES.en]),
      );
    }
  });

  it('has a name for every prayer in every language', () => {
    for (const lang of LANGS) for (const p of PRAYERS) expect(prayerName(lang, p)).not.toBe('');
    expect(PRAYERS.map((p) => prayerName('tr', p))).toEqual([
      'İmsak',
      'Güneş',
      'Öğle',
      'İkindi',
      'Akşam',
      'Yatsı',
    ]);
  });
});

describe('t', () => {
  it('returns the string for the language and interpolates', () => {
    expect(t('tr', 'app.name')).toBe('Ezan Saati');
    expect(t('en', 'prealert.text', { prayer: 'Maghrib', n: 10 })).toBe('Maghrib in 10 min');
    expect(t('tr', 'prealert.text', { prayer: 'Akşam', n: 10 })).toBe('Akşam vaktine 10 dk');
  });

  it('leaves unknown placeholders in place', () => {
    expect(t('en', 'prealert.text', { prayer: 'Asr' })).toBe('Asr in {n} min');
  });

  it('formats Arabic with Arabic-Indic digits', () => {
    expect(INTL_LOCALE.ar).toBe('ar-u-nu-arab');
    expect(LANGS).toEqual(['tr', 'en', 'ar']);
  });
});
