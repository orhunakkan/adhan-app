import { describe, expect, it } from 'vitest';
import { periodAt } from '../../src/core/period';
import { PRAYERS } from '../../src/core/prayerTimes';
import { daysAround, ISNA, OSLO, plus, SEC } from '../helpers/days';

const days = daysAround('2026-05-10');
const { yesterday, today, tomorrow } = days;
const NEXT = {
  fajr: 'sunrise',
  sunrise: 'dhuhr',
  dhuhr: 'asr',
  asr: 'maghrib',
  maghrib: 'isha',
  isha: 'fajr',
} as const;
const PREV = {
  fajr: 'isha',
  sunrise: 'fajr',
  dhuhr: 'sunrise',
  asr: 'dhuhr',
  maghrib: 'asr',
  isha: 'maghrib',
} as const;

describe('periodAt', () => {
  describe.each(PRAYERS)('around %s', (p) => {
    it('is the previous period one second before', () => {
      expect(periodAt(plus(today[p], -SEC), days).period).toBe(PREV[p]);
    });

    it('starts exactly at the prayer time and runs until the next one', () => {
      const info = periodAt(today[p], days);
      expect(info.period).toBe(p);
      expect(info.start).toEqual(today[p]);
      expect(info.next).toBe(NEXT[p]);
      expect(info.end).toEqual(p === 'isha' ? tomorrow.fajr : today[NEXT[p]]);
    });

    it('is unchanged one second after', () => {
      expect(periodAt(plus(today[p], SEC), days).period).toBe(p);
    });
  });

  it("is isha from midnight until fajr, starting at yesterday's isha", () => {
    const info = periodAt(plus(today.fajr, -60 * 60 * SEC), days);
    expect(info).toMatchObject({
      period: 'isha',
      start: yesterday.isha,
      end: today.fajr,
      next: 'fajr',
    });
  });

  it('reports progress through the period from 0 to 1', () => {
    const mid = new Date((today.dhuhr.getTime() + today.asr.getTime()) / 2);
    expect(periodAt(today.dhuhr, days).progress).toBe(0);
    expect(periodAt(mid, days).progress).toBeCloseTo(0.5, 5);
    expect(periodAt(plus(today.asr, -1), days).progress).toBeGreaterThan(0.999);
  });

  it('handles Isha after midnight at high latitude (Oslo, June)', () => {
    // TwilightAngle puts Isha after midnight but before Fajr (MiddleOfTheNight makes them equal).
    const oslo = daysAround('2026-06-21', OSLO, {
      ...ISNA,
      method: 'MuslimWorldLeague',
      highLatitudeRule: 'TwilightAngle',
    });
    // Yesterday's Isha is after midnight, so just after midnight it is still Maghrib.
    expect(oslo.yesterday.isha.getTime()).toBeGreaterThan(
      new Date('2026-06-20T22:00:00Z').getTime(),
    );
    const afterMidnight = plus(oslo.yesterday.isha, -60 * SEC);
    expect(periodAt(afterMidnight, oslo).period).toBe('maghrib');
    expect(periodAt(oslo.yesterday.isha, oslo).period).toBe('isha');
  });

  it('gives a zero-length isha when a high-latitude rule makes Isha equal to Fajr', () => {
    const oslo = daysAround('2026-06-21', OSLO, { ...ISNA, method: 'MuslimWorldLeague' });
    expect(oslo.yesterday.isha).toEqual(oslo.today.fajr);
    expect(periodAt(oslo.today.fajr, oslo).period).toBe('fajr');
  });

  it('throws when now is outside the three days it was given', () => {
    expect(() => periodAt(plus(yesterday.fajr, -SEC), days)).toThrow(/outside/);
    expect(() => periodAt(plus(tomorrow.isha, SEC), days)).toThrow(/outside/);
  });
});
