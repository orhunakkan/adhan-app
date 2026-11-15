// Current prayer period (brief §8.3): drives the sky gradient, the progress
// ring and the next-prayer card. Pure.
import { PRAYERS, type DayTimes, type PrayerName } from './prayerTimes';

export interface ThreeDays {
  yesterday: DayTimes;
  today: DayTimes;
  tomorrow: DayTimes;
}

export interface PeriodInfo {
  period: PrayerName;
  start: Date;
  end: Date;
  /** The prayer that ends this period. */
  next: PrayerName;
  /** Fraction of the period elapsed, 0…1. */
  progress: number;
}

interface PrayerEvent {
  prayer: PrayerName;
  at: Date;
}

/** Every prayer of the three days in time order (handles Isha after midnight). */
export function timeline(days: ThreeDays): PrayerEvent[] {
  return [days.yesterday, days.today, days.tomorrow].flatMap((d) =>
    PRAYERS.map((prayer) => ({ prayer, at: d[prayer] })),
  );
}

export function periodAt(now: Date, days: ThreeDays): PeriodInfo {
  const events = timeline(days);
  const t = now.getTime();
  for (let i = events.length - 2; i >= 0; i--) {
    const cur = events[i]!;
    const nxt = events[i + 1]!;
    if (cur.at.getTime() <= t && t < nxt.at.getTime()) {
      const span = nxt.at.getTime() - cur.at.getTime();
      return {
        period: cur.prayer,
        start: cur.at,
        end: nxt.at,
        next: nxt.prayer,
        progress: (t - cur.at.getTime()) / span,
      };
    }
  }
  throw new RangeError('now is outside the three days of prayer times provided');
}
