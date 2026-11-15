import { describe, expect, it } from 'vitest';
import { computeDay, PRAYERS, type CalcSettings } from '../../src/core/prayerTimes';
import { formatTime } from '../../src/core/time';

const calc: CalcSettings = {
  method: 'NorthAmerica',
  madhab: 'Shafi',
  highLatitudeRule: 'MiddleOfTheNight',
  offsets: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
};
const CHICAGO = { name: 'Schaumburg, IL', lat: 42.0334, lng: -88.0834, tz: 'America/Chicago' };
const ISTANBUL = { name: 'İstanbul', lat: 41.0082, lng: 28.9784, tz: 'Europe/Istanbul' };
const hhmm = (d: Date, tz: string) =>
  formatTime(d, { tz, hour12: false, seconds: false, locale: 'en' });
const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

describe('prayer times across DST changes', () => {
  it.each([
    ['spring forward', '2026-03-07', '2026-03-08', 60],
    ['fall back', '2026-10-31', '2026-11-01', -60],
  ])('Chicago %s shifts local clock times by about %s→%s ±1 h', (_n, before, after, shift) => {
    const a = computeDay(before, CHICAGO, calc);
    const b = computeDay(after, CHICAGO, calc);
    // Dhuhr moves by ~0–1 min day to day in solar terms; on the DST day the wall clock jumps.
    const delta = minutes(hhmm(b.dhuhr, CHICAGO.tz)) - minutes(hhmm(a.dhuhr, CHICAGO.tz));
    expect(Math.abs(delta - shift)).toBeLessThanOrEqual(1);
    for (const p of PRAYERS) expect(b[p].getTime()).toBeGreaterThan(a[p].getTime());
  });

  it('Istanbul (no DST) moves smoothly across the dates Europe changes clocks', () => {
    const a = computeDay('2026-03-28', ISTANBUL, { ...calc, method: 'Turkey' });
    const b = computeDay('2026-03-29', ISTANBUL, { ...calc, method: 'Turkey' });
    const delta = minutes(hhmm(b.dhuhr, ISTANBUL.tz)) - minutes(hhmm(a.dhuhr, ISTANBUL.tz));
    expect(Math.abs(delta)).toBeLessThanOrEqual(1);
  });

  it('each prayer lands on its own calendar date in the configured zone', () => {
    const t = computeDay('2026-03-08', CHICAGO, calc);
    for (const p of PRAYERS) {
      expect(new Intl.DateTimeFormat('en-CA', { timeZone: CHICAGO.tz }).format(t[p])).toBe(
        '2026-03-08',
      );
    }
  });
});
