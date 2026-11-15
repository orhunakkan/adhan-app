import { describe, expect, it } from 'vitest';
import { formatHijri, hijriCalendar } from '../../src/core/hijri';

const d = new Date('2026-11-08T09:00:00Z'); // 28 Jumada al-Ula 1448 (Umm al-Qura)

/** A DateTimeFormat stand-in whose resolved calendar is forced, to simulate older engines. */
function intlResolving(calendar: string): typeof Intl.DateTimeFormat {
  return function FakeDTF(locale: string, opts: Intl.DateTimeFormatOptions) {
    const real = new Intl.DateTimeFormat(locale, { ...opts, calendar: 'gregory' });
    return {
      resolvedOptions: () => ({ ...real.resolvedOptions(), calendar }),
      formatToParts: (x: Date) => real.formatToParts(x),
      format: (x: Date) => real.format(x),
    };
  } as unknown as typeof Intl.DateTimeFormat;
}

describe('hijriCalendar', () => {
  it('prefers islamic-umalqura when the engine supports it', () => {
    expect(hijriCalendar()).toBe('islamic-umalqura');
  });

  it('falls back to islamic, then to none', () => {
    expect(hijriCalendar(intlResolving('islamic'))).toBe('islamic');
    expect(hijriCalendar(intlResolving('gregory'))).toBeNull();
  });

  it('treats a throwing engine as unsupported', () => {
    const throwing = function () {
      throw new RangeError('bad calendar');
    } as unknown as typeof Intl.DateTimeFormat;
    expect(hijriCalendar(throwing)).toBeNull();
  });
});

describe('formatHijri', () => {
  it.each([
    ['tr', /^28 Cemaziyelevvel 1448$/],
    ['en', /^28 Jumada I 1448$/],
    ['ar-u-nu-arab', /^٢٨ جمادى الأولى ١٤٤٨$/],
  ])('formats in %s without the era', (locale, pattern) => {
    expect(formatHijri(d, { tz: 'Europe/Istanbul', locale })).toMatch(pattern);
  });

  it('uses the configured zone for the civil date', () => {
    // 23:30 UTC on Nov 8 is already Nov 9 in Istanbul.
    const late = new Date('2026-11-08T23:30:00Z');
    expect(formatHijri(late, { tz: 'Europe/Istanbul', locale: 'en' })).toMatch(/^29 /);
    expect(formatHijri(late, { tz: 'America/Chicago', locale: 'en' })).toMatch(/^28 /);
  });

  it('returns null when the engine cannot produce day, month and year', () => {
    const partless = function () {
      return {
        resolvedOptions: () => ({ calendar: 'islamic-umalqura' }),
        formatToParts: () => [{ type: 'literal', value: ' ' }],
      };
    } as unknown as typeof Intl.DateTimeFormat;
    expect(formatHijri(d, { tz: 'UTC', locale: 'en' }, partless)).toBeNull();
  });

  it('returns null (hidden) when no Islamic calendar is available', () => {
    expect(formatHijri(d, { tz: 'UTC', locale: 'en' }, intlResolving('gregory'))).toBeNull();
  });
});
