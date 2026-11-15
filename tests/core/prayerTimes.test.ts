import { describe, expect, it } from 'vitest';
import {
  AZAN_PRAYERS,
  CALCULATION_METHODS,
  computeDay,
  computeToday,
  PRAYERS,
  type CalcSettings,
  type Location,
  type PrayerName,
} from '../../src/core/prayerTimes';
import { addDays, parseDateKey } from '../../src/core/time';
import { loadPrayerFixtures } from '../helpers/prayerFixtures';
import { ORACLE_METHODS, oracleTimes } from '../helpers/solarOracle';

const ZERO_OFFSETS: Record<PrayerName, number> = {
  fajr: 0,
  sunrise: 0,
  dhuhr: 0,
  asr: 0,
  maghrib: 0,
  isha: 0,
};

const calc = (over: Partial<CalcSettings> = {}): CalcSettings => ({
  method: 'NorthAmerica',
  madhab: 'Shafi',
  highLatitudeRule: 'MiddleOfTheNight',
  offsets: ZERO_OFFSETS,
  ...over,
});

/** Minutes since local midnight of `date` in `tz` — independent of the process TZ. */
function minutesInZone(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return get('hour') * 60 + get('minute');
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** Circular difference in minutes, so 23:59 vs 00:01 is 2, not 1438. */
function diffMinutes(a: number, b: number): number {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
}

const TOLERANCE_MIN = 2;

describe('computeDay against reference tables (±2 min)', () => {
  describe.each(loadPrayerFixtures())('$file', ({ fixture }) => {
    const location: Location = { ...fixture.location };
    const settings = calc({
      method: fixture.method,
      madhab: fixture.madhab,
      highLatitudeRule: fixture.highLatitudeRule,
    });

    it.each(fixture.days)('$date', (day) => {
      const times = computeDay(day.date, location, settings);
      expect(times.dateKey).toBe(day.date);
      for (const p of PRAYERS) {
        const got = minutesInZone(times[p], location.tz);
        const want = toMinutes(day[p]);
        expect(
          diffMinutes(got, want),
          `${p}: got ${got} want ${day[p]} (${fixture.source})`,
        ).toBeLessThanOrEqual(TOLERANCE_MIN);
      }
    });
  });
});

const SCHAUMBURG: Location = {
  name: 'Schaumburg, IL',
  lat: 42.0334,
  lng: -88.0834,
  tz: 'America/Chicago',
};
const ISTANBUL: Location = { name: 'İstanbul', lat: 41.0082, lng: 28.9784, tz: 'Europe/Istanbul' };
const OSLO: Location = { name: 'Oslo', lat: 59.9139, lng: 10.7522, tz: 'Europe/Oslo' };
const HELSINKI: Location = { name: 'Helsinki', lat: 60.1699, lng: 24.9384, tz: 'Europe/Helsinki' };
const MECCA: Location = { name: 'Mecca', lat: 21.4225, lng: 39.8262, tz: 'Asia/Riyadh' };
const TROMSO: Location = { name: 'Tromsø', lat: 69.6496, lng: 18.956, tz: 'Europe/Oslo' };

describe('computeDay against the NOAA solar-position oracle (every day of 2026, ±90 s)', () => {
  // adhan rounds to the nearest minute and its Asr runs up to ~88 s from NOAA
  // in winter at 42°N, so the budget is 90 s — tighter than the ±2 min table checks.
  const ORACLE_TOLERANCE_MS = 90_000;
  const days = Array.from({ length: 365 }, (_, i) => addDays('2026-01-01', i));

  describe.each([SCHAUMBURG, ISTANBUL, MECCA])('$name', (location) => {
    it.each(
      (['NorthAmerica', 'Turkey'] as const).flatMap((method) =>
        (['Shafi', 'Hanafi'] as const).map((madhab) => ({ method, madhab })),
      ),
    )('$method / $madhab', ({ method, madhab }) => {
      for (const key of days) {
        const { year, month, day } = parseDateKey(key);
        const got = computeDay(key, location, calc({ method, madhab }));
        const want = oracleTimes(
          year,
          month,
          day,
          location.lat,
          location.lng,
          ORACLE_METHODS[method],
          madhab,
        );
        for (const p of PRAYERS) {
          const delta = Math.abs(got[p].getTime() - want[p].getTime());
          expect(delta, `${key} ${p} off by ${delta / 1000}s`).toBeLessThanOrEqual(
            ORACLE_TOLERANCE_MS,
          );
        }
      }
    });
  });

  it("the oracle itself agrees with Diyanet's published İstanbul table (±2 min)", () => {
    const diyanet = loadPrayerFixtures().find((f) => f.file === 'istanbul-diyanet.json')!.fixture;
    for (const day of diyanet.days) {
      const { year, month, day: d } = parseDateKey(day.date);
      const o = oracleTimes(year, month, d, ISTANBUL.lat, ISTANBUL.lng, ORACLE_METHODS.Turkey);
      for (const p of PRAYERS) {
        const got = minutesInZone(o[p], ISTANBUL.tz);
        expect(diffMinutes(got, toMinutes(day[p])), `${day.date} ${p}`).toBeLessThanOrEqual(
          TOLERANCE_MIN,
        );
      }
    }
  });
});

const ascending = (t: ReturnType<typeof computeDay>) =>
  PRAYERS.every((p, i) => i === 0 || t[PRAYERS[i - 1]!].getTime() < t[p].getTime());

describe('computeDay invariants', () => {
  const cases = CALCULATION_METHODS.flatMap((method) =>
    (['Shafi', 'Hanafi'] as const).map((madhab) => ({ method, madhab })),
  );

  describe.each([SCHAUMBURG, ISTANBUL, MECCA])('$name', (location) => {
    it.each(cases)('$method / $madhab yields valid ascending times', ({ method, madhab }) => {
      for (const date of ['2026-01-15', '2026-03-08', '2026-06-21', '2026-11-01']) {
        const t = computeDay(date, location, calc({ method, madhab }));
        for (const p of PRAYERS)
          expect(Number.isFinite(t[p].getTime()), `${method} ${p}`).toBe(true);
        expect(ascending(t), `${method} ${madhab} ${date}`).toBe(true);
      }
    });
  });

  it('Hanafi Asr is later than Shafi Asr', () => {
    const shafi = computeDay('2026-05-01', ISTANBUL, calc({ method: 'Turkey' }));
    const hanafi = computeDay('2026-05-01', ISTANBUL, calc({ method: 'Turkey', madhab: 'Hanafi' }));
    expect(hanafi.asr.getTime()).toBeGreaterThan(shafi.asr.getTime() + 30 * 60_000);
  });

  describe.each([OSLO, HELSINKI])('$name in June', (location) => {
    it.each(['MiddleOfTheNight', 'SeventhOfTheNight', 'TwilightAngle'] as const)(
      '%s produces every time, ascending, with Isha allowed after midnight',
      (highLatitudeRule) => {
        for (let d = 1; d <= 30; d++) {
          const date = `2026-06-${String(d).padStart(2, '0')}`;
          const t = computeDay(
            date,
            location,
            calc({ method: 'MuslimWorldLeague', highLatitudeRule }),
          );
          for (const p of PRAYERS) expect(Number.isFinite(t[p].getTime())).toBe(true);
          expect(ascending(t)).toBe(true);
        }
      },
    );
  });

  it('resolves polar day inside the Arctic circle instead of returning NaN', () => {
    const t = computeDay('2026-06-21', TROMSO, calc({ method: 'MuslimWorldLeague' }));
    for (const p of PRAYERS) expect(Number.isFinite(t[p].getTime()), p).toBe(true);
  });
});

describe('per-prayer offsets', () => {
  it.each([-30, -7, 1, 13, 30])('shifts every prayer by exactly %i minutes', (minutes) => {
    const base = computeDay('2026-04-10', ISTANBUL, calc({ method: 'Turkey' }));
    const offsets = Object.fromEntries(PRAYERS.map((p) => [p, minutes])) as Record<
      PrayerName,
      number
    >;
    const shifted = computeDay('2026-04-10', ISTANBUL, calc({ method: 'Turkey', offsets }));
    for (const p of PRAYERS) {
      expect(shifted[p].getTime() - base[p].getTime()).toBe(minutes * 60_000);
    }
  });

  it('shifts only the prayer that has an offset', () => {
    const base = computeDay('2026-04-10', SCHAUMBURG, calc());
    const shifted = computeDay(
      '2026-04-10',
      SCHAUMBURG,
      calc({ offsets: { ...ZERO_OFFSETS, asr: 4 } }),
    );
    for (const p of PRAYERS) {
      expect(shifted[p].getTime() - base[p].getTime()).toBe(p === 'asr' ? 4 * 60_000 : 0);
    }
  });

  it('rejects offsets outside −30…+30', () => {
    expect(() =>
      computeDay('2026-04-10', SCHAUMBURG, calc({ offsets: { ...ZERO_OFFSETS, isha: 31 } })),
    ).toThrow(/offset/i);
  });
});

describe('computeToday', () => {
  it('returns today and tomorrow for the location calendar date, not the process date', () => {
    // 2026-03-01 23:30 in Chicago is already 2026-03-02 in UTC and Istanbul.
    const now = new Date('2026-03-02T05:30:00Z');
    const { today, tomorrow } = computeToday(now, SCHAUMBURG, calc());
    expect(today.dateKey).toBe('2026-03-01');
    expect(tomorrow.dateKey).toBe('2026-03-02');
    expect(tomorrow.fajr.getTime()).toBeGreaterThan(today.isha.getTime());
  });

  it('rolls over a month and a year boundary', () => {
    const { today, tomorrow } = computeToday(new Date('2026-12-31T12:00:00Z'), ISTANBUL, calc());
    expect([today.dateKey, tomorrow.dateKey]).toEqual(['2026-12-31', '2027-01-01']);
  });
});

describe('exports', () => {
  it('lists the five azan prayers without sunrise', () => {
    expect(AZAN_PRAYERS).toEqual(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);
  });

  it('supports every adhan-js calculation method', () => {
    expect(CALCULATION_METHODS).toEqual([
      'MuslimWorldLeague',
      'Egyptian',
      'Karachi',
      'UmmAlQura',
      'Dubai',
      'MoonsightingCommittee',
      'NorthAmerica',
      'Kuwait',
      'Qatar',
      'Singapore',
      'Tehran',
      'Turkey',
    ]);
  });
});
