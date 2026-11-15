// Prayer-time calculation (brief §5). Pure: inputs in, instants out.
import {
  CalculationMethod,
  Coordinates,
  HighLatitudeRule as AdhanHighLatitudeRule,
  Madhab as AdhanMadhab,
  PolarCircleResolution,
  PrayerTimes,
} from 'adhan';
import { addDays, dateKeyInZone, parseDateKey, type DateKey } from './time';

export const PRAYERS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type PrayerName = (typeof PRAYERS)[number];

/** Prayers that have an azan. Sunrise is shown but never plays (brief §6). */
export const AZAN_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type AzanPrayer = (typeof AZAN_PRAYERS)[number];

export const CALCULATION_METHODS = [
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
] as const;
export type CalculationMethodName = (typeof CALCULATION_METHODS)[number];

export const MADHABS = ['Shafi', 'Hanafi'] as const;
export type MadhabName = (typeof MADHABS)[number];

export const HIGH_LATITUDE_RULES = [
  'MiddleOfTheNight',
  'SeventhOfTheNight',
  'TwilightAngle',
] as const;
export type HighLatitudeRuleName = (typeof HIGH_LATITUDE_RULES)[number];

export const OFFSET_LIMIT_MIN = 30;

export interface Location {
  name: string;
  lat: number;
  lng: number;
  /** IANA time zone, e.g. 'Europe/Istanbul'. */
  tz: string;
}

export interface CalcSettings {
  method: CalculationMethodName;
  madhab: MadhabName;
  highLatitudeRule: HighLatitudeRuleName;
  /** Minutes added to each time, −30…+30 (to match a mosque or Diyanet's table). */
  offsets: Readonly<Record<PrayerName, number>>;
}

export type DayTimes = Readonly<Record<PrayerName, Date>> & { readonly dateKey: DateKey };

const ADHAN_MADHAB: Record<MadhabName, (typeof AdhanMadhab)[keyof typeof AdhanMadhab]> = {
  Shafi: AdhanMadhab.Shafi,
  Hanafi: AdhanMadhab.Hanafi,
};

const ADHAN_HIGH_LAT: Record<
  HighLatitudeRuleName,
  (typeof AdhanHighLatitudeRule)['MiddleOfTheNight' | 'SeventhOfTheNight' | 'TwilightAngle']
> = {
  MiddleOfTheNight: AdhanHighLatitudeRule.MiddleOfTheNight,
  SeventhOfTheNight: AdhanHighLatitudeRule.SeventhOfTheNight,
  TwilightAngle: AdhanHighLatitudeRule.TwilightAngle,
};

/** Prayer times for one calendar date at the location (the date is in the location's zone). */
export function computeDay(dateKey: DateKey, location: Location, calc: CalcSettings): DayTimes {
  for (const p of PRAYERS) {
    const o = calc.offsets[p];
    if (!Number.isInteger(o) || Math.abs(o) > OFFSET_LIMIT_MIN) {
      throw new RangeError(`Invalid ${p} offset ${o}: must be an integer in ±${OFFSET_LIMIT_MIN}`);
    }
  }
  const params = CalculationMethod[calc.method]();
  params.madhab = ADHAN_MADHAB[calc.madhab];
  params.highLatitudeRule = ADHAN_HIGH_LAT[calc.highLatitudeRule];
  // Inside the polar circles some days have no sunrise/sunset; use the nearest day that does.
  params.polarCircleResolution = PolarCircleResolution.AqrabYaum;
  params.adjustments = { ...calc.offsets };

  // adhan reads the calendar date from the Date's *local* fields, so build a
  // local noon on that calendar day: correct in any process time zone.
  const { year, month, day } = parseDateKey(dateKey);
  const t = new PrayerTimes(
    new Coordinates(location.lat, location.lng),
    new Date(year, month - 1, day, 12),
    params,
  );
  return {
    dateKey,
    fajr: t.fajr,
    sunrise: t.sunrise,
    dhuhr: t.dhuhr,
    asr: t.asr,
    maghrib: t.maghrib,
    isha: t.isha,
  };
}

/** Today's and tomorrow's times, where "today" is the calendar date at the location. */
export function computeToday(
  now: Date,
  location: Location,
  calc: CalcSettings,
): { today: DayTimes; tomorrow: DayTimes } {
  const key = dateKeyInZone(now, location.tz);
  return {
    today: computeDay(key, location, calc),
    tomorrow: computeDay(addDays(key, 1), location, calc),
  };
}
