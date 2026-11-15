import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateKeyInZone,
  formatDate,
  formatTime,
  parseDateKey,
  timeParts,
  zonedParts,
} from '../../src/core/time';

describe('dateKeyInZone', () => {
  it.each([
    ['2026-03-02T05:30:00Z', 'America/Chicago', '2026-03-01'],
    ['2026-03-02T05:30:00Z', 'Europe/Istanbul', '2026-03-02'],
    ['2026-12-31T15:30:00Z', 'Asia/Tokyo', '2027-01-01'],
    ['2026-06-01T00:00:00Z', 'UTC', '2026-06-01'],
  ])('%s in %s is %s', (iso, tz, key) => {
    expect(dateKeyInZone(new Date(iso), tz)).toBe(key);
  });

  it('reuses one formatter per zone and gives stable results', () => {
    const d = new Date('2026-07-01T12:00:00Z');
    expect(dateKeyInZone(d, 'Europe/Oslo')).toBe(dateKeyInZone(d, 'Europe/Oslo'));
  });
});

describe('zonedParts', () => {
  it('reports midnight as hour 0', () => {
    expect(zonedParts(new Date('2026-05-05T21:00:00Z'), 'Europe/Istanbul')).toEqual({
      year: 2026,
      month: 5,
      day: 6,
      hour: 0,
      minute: 0,
      second: 0,
    });
  });
});

describe('parseDateKey / addDays', () => {
  it('parses a date key', () => {
    expect(parseDateKey('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it.each(['2026-2-28', '26-02-28', '2026/02/28', ''])('rejects %j', (key) => {
    expect(() => parseDateKey(key)).toThrow(/Invalid date key/);
  });

  it.each([
    ['2026-02-28', 1, '2026-03-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2026-03-08', 0, '2026-03-08'],
    ['2026-01-31', 30, '2026-03-02'],
  ])('%s %+d days is %s', (key, n, out) => {
    expect(addDays(key, n)).toBe(out);
  });
});

describe('formatTime / formatDate in the configured zone', () => {
  const d = new Date('2026-07-15T18:05:09Z');

  it.each([
    ['America/Chicago', false, false, '13:05'],
    ['America/Chicago', true, false, '1:05 PM'],
    ['Europe/Istanbul', false, true, '21:05:09'],
    ['Asia/Tokyo', false, false, '03:05'],
  ])('%s hour12=%s seconds=%s → %s', (tz, hour12, seconds, out) => {
    const got = formatTime(d, { tz, hour12, seconds, locale: 'en' });
    // ICU versions differ on the space before AM/PM (U+0020, U+00A0 or U+202F).
    expect(got.replace(/[\u00a0\u202f]/g, ' ')).toBe(out);
  });

  it('uses the locale for 12-hour markers', () => {
    expect(
      formatTime(d, { tz: 'Europe/Istanbul', hour12: true, seconds: false, locale: 'tr' }),
    ).toMatch(/^ÖS\s9:05$|^9:05\sÖS$/);
  });

  it.each([
    ['tr', '15 Temmuz 2026 Çarşamba'],
    ['en', 'Wednesday, July 15, 2026'],
  ])('formats the Gregorian date in %s', (locale, out) => {
    expect(formatDate(d, { tz: 'Europe/Istanbul', locale })).toBe(out);
  });

  it('returns the same text from the cached formatter on repeat calls', () => {
    const f = { tz: 'Europe/Istanbul', locale: 'en' };
    expect(formatDate(d, f)).toBe(formatDate(d, f));
  });

  it('formats the Arabic date with Arabic-Indic digits', () => {
    expect(formatDate(d, { tz: 'Asia/Riyadh', locale: 'ar-u-nu-arab' })).toMatch(/٢٠٢٦/);
  });
});

describe('daylight-saving transitions', () => {
  it('America/Chicago spring-forward: 01:59 CST → 03:00 CDT', () => {
    const before = new Date('2026-03-08T07:59:00Z');
    const after = new Date('2026-03-08T08:00:00Z');
    const fmt = (x: Date) =>
      formatTime(x, { tz: 'America/Chicago', hour12: false, seconds: false, locale: 'en' });
    expect([fmt(before), fmt(after)]).toEqual(['01:59', '03:00']);
    expect(dateKeyInZone(after, 'America/Chicago')).toBe('2026-03-08');
  });

  it('America/Chicago fall-back: 01:30 happens twice and stays on the same date', () => {
    const first = new Date('2026-11-01T06:30:00Z');
    const second = new Date('2026-11-01T07:30:00Z');
    const fmt = (x: Date) =>
      formatTime(x, { tz: 'America/Chicago', hour12: false, seconds: false, locale: 'en' });
    expect([fmt(first), fmt(second)]).toEqual(['01:30', '01:30']);
    expect(dateKeyInZone(second, 'America/Chicago')).toBe('2026-11-01');
  });

  it('Europe/Istanbul has no DST: UTC+3 all year', () => {
    for (const iso of ['2026-01-15T09:00:00Z', '2026-07-15T09:00:00Z']) {
      expect(
        formatTime(new Date(iso), {
          tz: 'Europe/Istanbul',
          hour12: false,
          seconds: false,
          locale: 'en',
        }),
      ).toBe('12:00');
    }
  });
});

describe('timeParts', () => {
  const d = new Date('2026-07-15T18:05:09Z');
  it.each([
    [
      { tz: 'Europe/Istanbul', hour12: false, seconds: true, locale: 'tr' },
      { hm: '21:05', seconds: '09', dayPeriod: '' },
    ],
    [
      { tz: 'America/Chicago', hour12: true, seconds: false, locale: 'en' },
      { hm: '1:05', seconds: '', dayPeriod: 'PM' },
    ],
    [
      { tz: 'Asia/Riyadh', hour12: false, seconds: false, locale: 'ar-u-nu-arab' },
      { hm: '٢١:٠٥', seconds: '', dayPeriod: '' },
    ],
  ])('%j', (f, parts) => {
    expect(timeParts(d, f)).toEqual(parts);
  });

  it('reuses formatters', () => {
    const f = { tz: 'UTC', hour12: false, seconds: false, locale: 'en' };
    expect(timeParts(d, f)).toEqual(timeParts(d, f));
  });
});
