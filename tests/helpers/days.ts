import {
  computeDay,
  type CalcSettings,
  type DayTimes,
  type Location,
} from '../../src/core/prayerTimes';
import { addDays } from '../../src/core/time';

export const ZERO_OFFSETS = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };

export const SCHAUMBURG: Location = {
  name: 'Schaumburg, IL',
  lat: 42.0334,
  lng: -88.0834,
  tz: 'America/Chicago',
};
export const OSLO: Location = { name: 'Oslo', lat: 59.9139, lng: 10.7522, tz: 'Europe/Oslo' };

export const ISNA: CalcSettings = {
  method: 'NorthAmerica',
  madhab: 'Shafi',
  highLatitudeRule: 'MiddleOfTheNight',
  offsets: ZERO_OFFSETS,
};

export interface Days {
  yesterday: DayTimes;
  today: DayTimes;
  tomorrow: DayTimes;
}

export function daysAround(key: string, location = SCHAUMBURG, calc = ISNA): Days {
  return {
    yesterday: computeDay(addDays(key, -1), location, calc),
    today: computeDay(key, location, calc),
    tomorrow: computeDay(addDays(key, 1), location, calc),
  };
}

export const plus = (d: Date, ms: number) => new Date(d.getTime() + ms);
export const MIN = 60_000;
export const SEC = 1000;
