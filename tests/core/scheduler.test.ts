import { describe, expect, it } from 'vitest';
import { AZAN_PRAYERS, type AzanPrayer } from '../../src/core/prayerTimes';
import { getDuePrayer, getUpcoming, parseFiredKey, parseFiredList } from '../../src/core/scheduler';
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
  getDuePrayer({ now, days, fired: [], enabled: ALL_ON, lateWindowMs: LATE, ...over });

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
      expect(
        due(plus(today[p], 5 * SEC), {
          fired: [{ key: `2026-05-10:${p}`, at: today[p].getTime() }],
        }),
      ).toBeNull();
    });

    it('is skipped when disabled', () => {
      expect(due(plus(today[p], 5 * SEC), { enabled: { ...ALL_ON, [p]: false } })).toBeNull();
    });
  });

  it('never fires for sunrise', () => {
    for (let s = 0; s <= 120; s += 10) expect(due(plus(today.sunrise, s * SEC))).toBeNull();
  });

  it('is not blocked by other fired keys, older or newer', () => {
    const fired = ['2026-05-10:dhuhr', '2026-05-10:maghrib', '2026-12-01:fajr'].map((key) => ({
      key,
      at: null,
    }));
    expect(due(plus(today.asr, 10 * SEC), { fired })?.prayer).toBe('asr');
  });

  it("fires yesterday's Isha just after midnight when it falls after midnight", () => {
    const oslo = daysAround('2026-06-21', OSLO, {
      ...ISNA,
      method: 'MuslimWorldLeague',
      highLatitudeRule: 'TwilightAngle',
    });
    const now = plus(oslo.yesterday.isha, 30 * SEC);
    expect(
      getDuePrayer({ now, days: oslo, fired: [], enabled: ALL_ON, lateWindowMs: LATE }),
    ).toEqual({
      prayer: 'isha',
      key: '2026-06-20:isha',
      at: oslo.yesterday.isha,
    });
  });

  it('returns coincident prayers one at a time, earliest key first', () => {
    const oslo = daysAround('2026-06-21', OSLO, { ...ISNA, method: 'MuslimWorldLeague' });
    expect(oslo.yesterday.isha).toEqual(oslo.today.fajr);
    const now = plus(oslo.today.fajr, 2 * SEC);
    const input = { now, days: oslo, enabled: ALL_ON, lateWindowMs: LATE };
    const first = getDuePrayer({ ...input, fired: [] });
    expect(first?.key).toBe('2026-06-20:isha');
    const second = getDuePrayer({
      ...input,
      fired: [{ key: first!.key, at: first!.at.getTime() }],
    });
    expect(second?.key).toBe('2026-06-21:fajr');
    const both = [first!, second!].map((e) => ({ key: e.key, at: e.at.getTime() }));
    expect(getDuePrayer({ ...input, fired: both })).toBeNull();
  });

  it('a key fires at most once, whatever its instant was (settings or location changed)', () => {
    for (const shift of [-8 * 60 * MIN, -75 * MIN, -25 * MIN]) {
      const fired = [{ key: '2026-05-10:asr', at: today.asr.getTime() + shift }];
      expect(due(plus(today.asr, SEC), { fired })).toBeNull();
    }
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

  it.each([
    [null, []],
    ['2026-05-10:asr', [{ key: '2026-05-10:asr', at: null }]],
    [
      '[{"key":"2026-05-10:asr","at":5},"2026-05-10:isha","junk",3,{"key":"x","at":1},{"key":"2026-05-10:fajr"}]',
      [
        { key: '2026-05-10:asr', at: 5 },
        { key: '2026-05-10:isha', at: null },
        { key: '2026-05-10:fajr', at: null },
      ],
    ],
    ['[{"key":"2026-05-10:asr","at":null}]', [{ key: '2026-05-10:asr', at: null }]],
    ['{"a":1}', []],
    ['not json', []],
  ])('parseFiredList(%j) → %j', (raw, list) => {
    expect(parseFiredList(raw)).toEqual(list);
  });
});

describe('getUpcoming (pre-alert and health-check lead times)', () => {
  it.each([
    ['11 min before', -11 * MIN, []],
    ['10 min before', -10 * MIN, ['asr']],
    ['1 s before', -SEC, ['asr']],
    ['at the prayer', 0, []],
  ])('with a 10 min lead, %s → %j', (_l, offset, prayers) => {
    const r = getUpcoming({
      now: plus(today.asr, offset),
      days,
      enabled: ALL_ON,
      leadMs: 10 * MIN,
    });
    expect(r.map((u) => u.prayer)).toEqual(prayers);
    if (r.length) expect(r[0]).toEqual({ prayer: 'asr', key: '2026-05-10:asr', at: today.asr });
  });

  it('skips disabled prayers and sunrise', () => {
    const enabled = { ...ALL_ON, asr: false };
    expect(getUpcoming({ now: plus(today.asr, -MIN), days, enabled, leadMs: 10 * MIN })).toEqual(
      [],
    );
    expect(
      getUpcoming({ now: plus(today.sunrise, -MIN), days, enabled: ALL_ON, leadMs: 10 * MIN }),
    ).toEqual([]);
  });

  it("finds tomorrow's Fajr late at night", () => {
    const r = getUpcoming({
      now: plus(days.tomorrow.fajr, -2 * MIN),
      days,
      enabled: ALL_ON,
      leadMs: 3 * MIN,
    });
    expect(r.map((u) => u.key)).toEqual(['2026-05-11:fajr']);
  });
});
