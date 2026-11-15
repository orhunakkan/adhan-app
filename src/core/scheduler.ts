// Azan scheduler (brief §6). A pure decision function plus a 1-second tick
// loop on the injected Clock. Never long timeouts: iOS throttles and drifts them.
import type { Settings } from '../config/schema';
import type { ThreeDays } from './period';
import type { Clock, KeyValueStore, TimerHandle } from './ports';
import { AZAN_PRAYERS, computeDay, PRAYERS, type AzanPrayer } from './prayerTimes';
import { KEYS } from './storage';
import { addDays, dateKeyInZone } from './time';

export const TICK_MS = 1000;
export const HEALTH_CHECK_LEAD_MS = 3 * 60_000;

/** A fired azan is remembered as "YYYY-MM-DD:prayer" (the prayer's own calendar date). */
export type FiredKey = string;

export interface DuePrayer {
  prayer: AzanPrayer;
  key: FiredKey;
  at: Date;
}

const KEY_RE = /^(\d{4}-\d{2}-\d{2}):(fajr|dhuhr|asr|maghrib|isha)$/;

export function parseFiredKey(key: string | null): { dateKey: string; prayer: AzanPrayer } | null {
  const m = key ? KEY_RE.exec(key) : null;
  return m ? { dateKey: m[1]!, prayer: m[2] as AzanPrayer } : null;
}

/** Orders keys by date, then by the prayer's position in the day. */
export function compareFiredKeys(a: FiredKey, b: FiredKey): number {
  const pa = parseFiredKey(a)!;
  const pb = parseFiredKey(b)!;
  if (pa.dateKey !== pb.dateKey) return pa.dateKey < pb.dateKey ? -1 : 1;
  return PRAYERS.indexOf(pa.prayer) - PRAYERS.indexOf(pb.prayer);
}

function azanEvents(days: ThreeDays): DuePrayer[] {
  return [days.yesterday, days.today, days.tomorrow].flatMap((d) =>
    AZAN_PRAYERS.map((prayer) => ({ prayer, key: `${d.dateKey}:${prayer}`, at: d[prayer] })),
  );
}

/**
 * The azan to fire now, if any. A prayer is due when 0 ≤ now − time ≤ lateWindow,
 * it is enabled, and it is later (by date, then prayer order) than the last fired
 * one — so nothing fires twice and an older prayer never fires after a newer one.
 * When several are due at once (Isha = Fajr at high latitude), the latest wins.
 */
export function getDuePrayer(input: {
  now: Date;
  days: ThreeDays;
  lastFired: FiredKey | null;
  enabled: Readonly<Record<AzanPrayer, boolean>>;
  lateWindowMs: number;
}): DuePrayer | null {
  const t = input.now.getTime();
  const last = parseFiredKey(input.lastFired) ? input.lastFired : null;
  let best: DuePrayer | null = null;
  for (const e of azanEvents(input.days)) {
    const late = t - e.at.getTime();
    if (late < 0 || late > input.lateWindowMs || !input.enabled[e.prayer]) continue;
    if (last && compareFiredKeys(e.key, last) <= 0) continue;
    best = e; // events are in time order, so the last match is the latest
  }
  return best;
}

/** The next enabled azan prayer starting within `leadMs` (now is before it). */
export function getUpcoming(input: {
  now: Date;
  days: ThreeDays;
  enabled: Readonly<Record<AzanPrayer, boolean>>;
  leadMs: number;
}): DuePrayer | null {
  const t = input.now.getTime();
  for (const e of azanEvents(input.days)) {
    const until = e.at.getTime() - t;
    if (until > 0 && until <= input.leadMs && input.enabled[e.prayer]) return e;
  }
  return null;
}

export type SchedulerEvent =
  | ({ type: 'azan' | 'preAlert' | 'healthCheck'; firedAt: Date } & DuePrayer)
  | { type: 'day'; days: ThreeDays; firedAt: Date };

export type PrayerEvent = Extract<SchedulerEvent, { prayer: AzanPrayer }>;

export interface Scheduler {
  start(): void;
  stop(): void;
  /** Recompute times now (settings changed, page became visible). */
  refresh(): void;
  days(): ThreeDays | null;
}

export function createScheduler(deps: {
  clock: Clock;
  store: KeyValueStore;
  getSettings: () => Settings;
  onEvent: (e: SchedulerEvent) => void;
  /** Called after every tick's decisions; drives the once-a-second UI update. */
  onTick?: (now: Date, days: ThreeDays | null) => void;
}): Scheduler {
  const { clock, store, getSettings, onEvent, onTick } = deps;
  let handle: TimerHandle | null = null;
  let days: ThreeDays | null = null;
  let lastPreAlert: FiredKey | null = null;
  let lastHealthCheck: FiredKey | null = null;

  const recompute = (now: Date) => {
    const s = getSettings();
    if (!s.location) {
      days = null;
      return;
    }
    const today = dateKeyInZone(now, s.location.tz);
    days = {
      yesterday: computeDay(addDays(today, -1), s.location, s.calc),
      today: computeDay(today, s.location, s.calc),
      tomorrow: computeDay(addDays(today, 1), s.location, s.calc),
    };
    onEvent({ type: 'day', days, firedAt: now });
  };

  const tick = () => {
    const now = clock.now();
    decide(now);
    onTick?.(now, days);
  };

  const decide = (now: Date) => {
    const s = getSettings();
    if (!s.location) {
      days = null;
      return;
    }
    if (!days || days.today.dateKey !== dateKeyInZone(now, s.location.tz)) recompute(now);
    const current = days!;
    const enabled = s.azan.enabled;

    const due = getDuePrayer({
      now,
      days: current,
      lastFired: store.get(KEYS.lastFired),
      enabled,
      lateWindowMs: s.azan.lateWindowSec * 1000,
    });
    if (due) {
      // Persist before notifying: a crash or reload mid-azan must not replay it.
      store.set(KEYS.lastFired, due.key);
      onEvent({ type: 'azan', firedAt: now, ...due });
    }

    if (s.azan.preAlertMin > 0) {
      const pre = getUpcoming({ now, days: current, enabled, leadMs: s.azan.preAlertMin * 60_000 });
      if (pre && pre.key !== lastPreAlert) {
        lastPreAlert = pre.key;
        onEvent({ type: 'preAlert', firedAt: now, ...pre });
      }
    }

    const hc = getUpcoming({ now, days: current, enabled, leadMs: HEALTH_CHECK_LEAD_MS });
    if (hc && hc.key !== lastHealthCheck) {
      lastHealthCheck = hc.key;
      onEvent({ type: 'healthCheck', firedAt: now, ...hc });
    }
  };

  return {
    start() {
      if (handle !== null) return;
      recompute(clock.now());
      tick();
      handle = clock.setInterval(tick, TICK_MS);
    },
    stop() {
      if (handle !== null) clock.clearInterval(handle);
      handle = null;
    },
    refresh() {
      recompute(clock.now());
    },
    days: () => days,
  };
}
