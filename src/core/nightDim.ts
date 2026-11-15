// Night dim schedule (brief §9): a dark overlay from Isha + X min to Fajr − Y
// min, lifted 1 min before any azan and while one plays. Pure.
import type { ThreeDays } from './period';
import { AZAN_PRAYERS } from './prayerTimes';

export interface NightDimSettings {
  enabled: boolean;
  afterIshaMin: number;
  beforeFajrMin: number;
  /** 0…1 */
  opacity: number;
}

export interface NightDimState {
  active: boolean;
  opacity: number;
}

const LIFT_BEFORE_AZAN_MS = 60_000;
const MIN = 60_000;

export function nightDimState(input: {
  now: Date;
  days: ThreeDays;
  settings: NightDimSettings;
  azanActive: boolean;
}): NightDimState {
  const { now, days, settings } = input;
  const off = { active: false, opacity: 0 };
  if (!settings.enabled || input.azanActive) return off;
  const t = now.getTime();

  const order = [days.yesterday, days.today, days.tomorrow];
  for (const day of order) {
    for (const p of AZAN_PRAYERS) {
      const at = day[p].getTime();
      if (t >= at - LIFT_BEFORE_AZAN_MS && t <= at) return off;
    }
  }

  // Night windows: yesterday's Isha → today's Fajr, today's Isha → tomorrow's Fajr.
  const windows: Array<[number, number]> = [
    [days.yesterday.isha.getTime(), days.today.fajr.getTime()],
    [days.today.isha.getTime(), days.tomorrow.fajr.getTime()],
  ];
  for (const [isha, fajr] of windows) {
    const from = isha + settings.afterIshaMin * MIN;
    const to = fajr - settings.beforeFajrMin * MIN;
    if (t >= from && t < to) return { active: true, opacity: settings.opacity };
  }
  return off;
}
