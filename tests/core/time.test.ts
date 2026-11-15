import { describe, expect, it } from 'vitest';
import { addDays, dateKeyInZone, parseDateKey, zonedParts } from '../../src/core/time';

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
