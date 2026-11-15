import { describe, expect, it } from 'vitest';
import { AZAN_PRAYERS, type AzanPrayer } from '../../src/core/prayerTimes';
import {
  compareFiredKeys,
  getDuePrayer,
  getUpcoming,
  parseFiredKey,
} from '../../src/core/scheduler';
import { daysAround, ISNA, MIN, OSLO, plus, SEC } from '../helpers/days';

const days = daysAround('2026-05-10');
const { yesterday, today } = days;
const ALL_ON: Record<AzanPrayer, boolean> = {
  fajr: true,
  dhuhr: true,
  asr: true,
  maghrib: true,
  isha: true,
};
const LATE = 120 * SEC;

const due = (now: Date, over: Partial<Parameters<typeof getDuePrayer>[0]> = {}) =>
  getDuePrayer({ now, days, lastFired: null, enabled: ALL_ON, lateWindowMs: LATE, ...over });

describe('getDuePrayer', () => {
  describe.each(AZAN_PRAYERS)('%s', (p) => {
    it.each([
      ['T − 1 s', -SEC, false],
      ['T', 0, true],
      ['T + 119 s', 119 * SEC, true],
      ['T + 120 s', 120 * SEC, true],
      ['T + 121 s', 121 * SEC, false],
    ])('%s → fires=%s', (_label, offset, fires) => {
      const result = due(plus(today[p], offset));
      expect(result?.prayer ?? null).toBe(fires ? p : null);
      if (fires) expect(result).toEqual({ prayer: p, key: `2026-05-10:${p}`, at: today[p] });
    });

    it('never fires the same key twice', () => {
      expect(due(plus(today[p], 5 * SEC), { lastFired: `2026-05-10:${p}` })).toBeNull();
    });

    it('is skipped when disabled', () => {
      expect(due(plus(today[p], 5 * SEC), { enabled: { ...ALL_ON, [p]: false } })).toBeNull();
    });
  });

  it('never fires for sunrise', () => {
    for (let s = 0; s <= 120; s += 10) expect(due(plus(today.sunrise, s * SEC))).toBeNull();
  });

  it('does not fire an older prayer after a newer one has fired', () => {
    expect(due(plus(today.asr, 10 * SEC), { lastFired: '2026-05-10:maghrib' })).toBeNull();
    expect(due(plus(today.asr, 10 * SEC), { lastFired: '2026-05-11:fajr' })).toBeNull();
  });

  it('fires the next prayer after an older key', () => {
    expect(due(plus(today.asr, 10 * SEC), { lastFired: '2026-05-10:dhuhr' })?.prayer).toBe('asr');
    expect(due(plus(today.fajr, 10 * SEC), { lastFired: '2026-05-09:isha' })?.prayer).toBe('fajr');
  });

  it("fires yesterday's Isha just after midnight when it falls after midnight", () => {
    const oslo = daysAround('2026-06-21', OSLO, {
      ...ISNA,
      method: 'MuslimWorldLeague',
      highLatitudeRule: 'TwilightAngle',
    });
    const now = plus(oslo.yesterday.isha, 30 * SEC);
    expect(
      getDuePrayer({
        now,
        days: oslo,
        lastFired: '2026-06-20:maghrib',
        enabled: ALL_ON,
        lateWindowMs: LATE,
      }),
    ).toEqual({ prayer: 'isha', key: '2026-06-20:isha', at: oslo.yesterday.isha });
  });

  it('fires only Fajr when Isha and Fajr coincide (high latitude), never Isha afterwards', () => {
    const oslo = daysAround('2026-06-21', OSLO, { ...ISNA, method: 'MuslimWorldLeague' });
    expect(oslo.yesterday.isha).toEqual(oslo.today.fajr);
    const now = plus(oslo.today.fajr, 2 * SEC);
    const first = getDuePrayer({
      now,
      days: oslo,
      lastFired: '2026-06-20:maghrib',
      enabled: ALL_ON,
      lateWindowMs: LATE,
    });
    expect(first?.key).toBe('2026-06-21:fajr');
    const second = getDuePrayer({
      now: plus(now, SEC),
      days: oslo,
      lastFired: first!.key,
      enabled: ALL_ON,
      lateWindowMs: LATE,
    });
    expect(second).toBeNull();
  });

  it('ignores a corrupt lastFired value', () => {
    expect(due(plus(today.dhuhr, SEC), { lastFired: 'garbage' })?.prayer).toBe('dhuhr');
  });

  it("does not fire yesterday's prayers on a new day", () => {
    expect(due(plus(yesterday.isha, 60 * MIN))).toBeNull();
  });
});

describe('fired keys', () => {
  it('parses valid keys and rejects others', () => {
    expect(parseFiredKey('2026-05-10:asr')).toEqual({ dateKey: '2026-05-10', prayer: 'asr' });
    expect(parseFiredKey('2026-05-10:sunrise')).toBeNull();
    expect(parseFiredKey('2026-5-10:asr')).toBeNull();
    expect(parseFiredKey(null)).toBeNull();
  });

  it('orders by date, then by prayer order', () => {
    expect(compareFiredKeys('2026-05-10:isha', '2026-05-11:fajr')).toBeLessThan(0);
    expect(compareFiredKeys('2026-05-10:asr', '2026-05-10:dhuhr')).toBeGreaterThan(0);
    expect(compareFiredKeys('2026-05-10:asr', '2026-05-10:asr')).toBe(0);
  });
});

describe('getUpcoming (pre-alert and health-check lead times)', () => {
  it.each([
    ['11 min before', -11 * MIN, null],
    ['10 min before', -10 * MIN, 'asr'],
    ['1 s before', -SEC, 'asr'],
    ['at the prayer', 0, null],
  ])('with a 10 min lead, %s → %s', (_l, offset, prayer) => {
    const r = getUpcoming({
      now: plus(today.asr, offset),
      days,
      enabled: ALL_ON,
      leadMs: 10 * MIN,
    });
    expect(r?.prayer ?? null).toBe(prayer);
    if (r) expect(r).toEqual({ prayer: 'asr', key: '2026-05-10:asr', at: today.asr });
  });

  it('skips disabled prayers and sunrise', () => {
    expect(
      getUpcoming({
        now: plus(today.asr, -MIN),
        days,
        enabled: { ...ALL_ON, asr: false },
        leadMs: 10 * MIN,
      }),
    ).toBeNull();
    expect(
      getUpcoming({ now: plus(today.sunrise, -MIN), days, enabled: ALL_ON, leadMs: 10 * MIN }),
    ).toBeNull();
  });

  it("finds tomorrow's Fajr late at night", () => {
    const r = getUpcoming({
      now: plus(days.tomorrow.fajr, -2 * MIN),
      days,
      enabled: ALL_ON,
      leadMs: 3 * MIN,
    });
    expect(r?.key).toBe('2026-05-11:fajr');
  });
});
