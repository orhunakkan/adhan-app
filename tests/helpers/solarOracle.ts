// Independent reference for prayer times: NOAA solar-position equations
// (Meeus, "Astronomical Algorithms"), iterated to the second. Used as a test
// oracle; it is a different implementation from adhan-js.
import type { PrayerName } from '../../src/core/prayerTimes';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

interface SunState {
  declination: number; // degrees
  equationOfTime: number; // minutes
}

export function sunAt(ms: number): SunState {
  const jd = ms / 86_400_000 + 2_440_587.5;
  const t = (jd - 2_451_545) / 36_525;
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const declination = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const equationOfTime =
    4 *
    DEG *
    (y * Math.sin(2 * l0 * RAD) -
      2 * e * Math.sin(m * RAD) +
      4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) -
      0.5 * y * y * Math.sin(4 * l0 * RAD) -
      1.25 * e * e * Math.sin(2 * m * RAD));
  return { declination, equationOfTime };
}

/** Solar noon (UTC ms) on the UTC calendar day `dayMs` (midnight UTC) at longitude `lng`. */
function transit(dayMs: number, lng: number): number {
  let ms = dayMs + (720 - 4 * lng) * 60_000;
  for (let i = 0; i < 4; i++) ms = dayMs + (720 - 4 * lng - sunAt(ms).equationOfTime) * 60_000;
  return ms;
}

/** Time the sun's centre reaches `altitude` before (side −1) or after (side +1) noon. */
function altitudeTime(noonMs: number, lat: number, altitude: number, side: -1 | 1): number {
  let ms = noonMs;
  for (let i = 0; i < 6; i++) {
    const { declination: d } = sunAt(ms);
    const cosH =
      (Math.sin(altitude * RAD) - Math.sin(lat * RAD) * Math.sin(d * RAD)) /
      (Math.cos(lat * RAD) * Math.cos(d * RAD));
    if (cosH < -1 || cosH > 1) return Number.NaN;
    const hourAngle = Math.acos(cosH) * DEG; // degrees; 15° per hour
    ms = noonMs + side * (hourAngle / 15) * 3_600_000;
  }
  return ms;
}

export interface OracleMethod {
  fajrAngle: number;
  ishaAngle: number;
  /** adhan-js method adjustments, in minutes. */
  adjust: Partial<Record<PrayerName, number>>;
}

export const ORACLE_METHODS = {
  NorthAmerica: { fajrAngle: 15, ishaAngle: 15, adjust: { dhuhr: 1 } },
  Turkey: { fajrAngle: 18, ishaAngle: 17, adjust: { sunrise: -7, dhuhr: 5, asr: 4, maghrib: 7 } },
} satisfies Record<string, OracleMethod>;

const SUNRISE_ALTITUDE = -0.8333; // refraction + solar semi-diameter

/**
 * Unrounded prayer instants for a location's calendar date. `dayStartUtcMs` is
 * that date at 00:00 UTC; the solar day is taken around the local noon.
 */
export function oracleTimes(
  year: number,
  month: number,
  day: number,
  lat: number,
  lng: number,
  method: OracleMethod,
  madhab: 'Shafi' | 'Hanafi' = 'Shafi',
): Record<PrayerName, Date> {
  const noon = transit(Date.UTC(year, month - 1, day), lng);
  const dNoon = sunAt(noon).declination;
  const shadow = madhab === 'Shafi' ? 1 : 2;
  const asrAltitude = Math.atan(1 / (shadow + Math.tan(Math.abs(lat - dNoon) * RAD))) * DEG;
  const raw: Record<PrayerName, number> = {
    fajr: altitudeTime(noon, lat, -method.fajrAngle, -1),
    sunrise: altitudeTime(noon, lat, SUNRISE_ALTITUDE, -1),
    dhuhr: noon,
    asr: altitudeTime(noon, lat, asrAltitude, 1),
    maghrib: altitudeTime(noon, lat, SUNRISE_ALTITUDE, 1),
    isha: altitudeTime(noon, lat, -method.ishaAngle, 1),
  };
  const adjust = method.adjust;
  return Object.fromEntries(
    Object.entries(raw).map(([p, ms]) => [
      p,
      new Date(ms + (adjust[p as PrayerName] ?? 0) * 60_000),
    ]),
  ) as Record<PrayerName, Date>;
}
