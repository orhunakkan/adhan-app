import { describe, expect, it } from 'vitest';
import { INTL_LOCALE, LANGS, MESSAGES, t } from '../../src/i18n';

describe('t', () => {
  it('returns the string for the language', () => {
    expect(t('tr', 'app.name')).toBe('Ezan Saati');
    expect(t('en', 'app.name')).toBe('Azan Clock');
  });

  it('interpolates {placeholders} and leaves unknown ones in place', () => {
    const msgs = MESSAGES.en as Record<string, string>;
    msgs['test.vars'] = '{name} in {n} min {missing}';
    try {
      expect(t('en', 'test.vars' as 'app.name', { name: 'Akşam', n: 10 })).toBe(
        'Akşam in 10 min {missing}',
      );
    } finally {
      delete msgs['test.vars'];
    }
  });

  it('formats Arabic with Arabic-Indic digits', () => {
    expect(INTL_LOCALE.ar).toBe('ar-u-nu-arab');
    expect(LANGS).toEqual(['tr', 'en', 'ar']);
  });
});
