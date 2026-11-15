import { describe, expect, it } from 'vitest';
import { applyLocale } from '../../src/i18n';

describe('applyLocale', () => {
  it('sets lang and dir=rtl for Arabic, ltr otherwise', () => {
    applyLocale(document, 'ar');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    applyLocale(document, 'tr');
    expect(document.documentElement.lang).toBe('tr');
    expect(document.documentElement.dir).toBe('ltr');
  });
});
