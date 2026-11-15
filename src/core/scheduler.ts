// Azan scheduler (brief §6). A pure decision function plus a 1-second tick
// loop on the injected Clock. Never long timeouts: iOS throttles and drifts them.
//
// Idempotency uses the SET of recently fired azans (key + instant), with
// instants (not key order) deciding what is due. Key order is not time order at
// high latitude: adhan can put Isha(D) after Fajr(D+1) in summer, or Asr before
// Dhuhr inside the polar circle. The instant tells a moved location's prayer
// (hours apart, same key) from an offset tweak of the same prayer (minutes).
import type { Settings } from '../config/schema';
import type { ThreeDays } from './period';
import type { Clock, KeyValueStore, TimerHandle } from './ports';
import { AZAN_PRAYERS, computeDay, type AzanPrayer } from './prayerTimes';
import { KEYS } from './storage';
import { addDays, dateKeyInZone } from './time';

export const TICK_MS = 1000;
export const HEALTH_CHECK_LEAD_MS = 3 * 60_000;
/** Fired azans kept (about six days): far more than any late window needs. */
export const FIRED_HISTORY = 32;
/** Same key within this distance = the same azan (offsets are at most ±30 min). */
export const SAME_AZAN_MS = 60 * 60_000;

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

export interface FiredEntry {
  key: FiredKey;
  /** Epoch ms of the prayer time that fired; NaN when unknown (legacy entries). */
  at: number;
}

/** Reads the fired list; accepts legacy plain keys; anything malformed is dropped. */
export function parseFiredList(raw: string | null): FiredEntry[] {
  if (raw === null) return [];
  if (parseFiredKey(raw)) return [{ key: raw, at: Number.NaN }];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.flatMap((v: unknown): FiredEntry[] => {
      if (typeof v === 'string') return KEY_RE.test(v) ? [{ key: v, at: Number.NaN }] : [];
      const e = v as { key?: unknown; at?: unknown } | null;
      return e && typeof e.key === 'string' && KEY_RE.test(e.key) && typeof e.at === 'number'
        ? [{ key: e.key, at: e.at }]
        : [];
    });
  } catch {
    return [];
  }
}

function alreadyFired(fired: readonly FiredEntry[], e: DuePrayer): boolean {
  return fired.some(
    (f) =>
      f.key === e.key && (Number.isNaN(f.at) || Math.abs(f.at - e.at.getTime()) <= SAME_AZAN_MS),
  );
}

/** Azan events of the three days, sorted by instant; NaN times (polar extremes) are dropped. */
function azanEvents(days: ThreeDays): DuePrayer[] {
  return [days.yesterday, days.today, days.tomorrow]
    .flatMap((d) =>
      AZAN_PRAYERS.map((prayer) => ({ prayer, key: `${d.dateKey}:${prayer}`, at: d[prayer] })),
    )
    .filter((e) => Number.isFinite(e.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * The azan to fire now, if any: enabled, not fired before, and 0 ≤ now − time
 * ≤ lateWindow. When several are due (Isha = Fajr at high latitude) the
 * earliest comes first; the next one is returned on a later tick.
 */
export function getDuePrayer(input: {
  now: Date;
  days: ThreeDays;
  fired: readonly FiredEntry[];
  enabled: Readonly<Record<AzanPrayer, boolean>>;
  lateWindowMs: number;
}): DuePrayer | null {
  const t = input.now.getTime();
  for (const e of azanEvents(input.days)) {
    const late = t - e.at.getTime();
    if (
      late >= 0 &&
      late <= input.lateWindowMs &&
      input.enabled[e.prayer] &&
      !alreadyFired(input.fired, e)
    ) {
      return e;
    }
  }
  return null;
}

/** Every enabled azan prayer starting within `leadMs` (now is before it), earliest first. */
export function getUpcoming(input: {
  now: Date;
  days: ThreeDays;
  enabled: Readonly<Record<AzanPrayer, boolean>>;
  leadMs: number;
}): DuePrayer[] {
  const t = input.now.getTime();
  return azanEvents(input.days).filter((e) => {
    const until = e.at.getTime() - t;
    return until > 0 && until <= input.leadMs && input.enabled[e.prayer];
  });
}

export type SchedulerEvent =
  | ({ type: 'azan' | 'preAlert' | 'healthCheck'; firedAt: Date } & DuePrayer)
  | { type: 'day'; days: ThreeDays | null; firedAt: Date };

export type PrayerEvent = Extract<SchedulerEvent, { prayer: AzanPrayer }>;

export interface Scheduler {
  start(): void;
  stop(): void;
  /** Recompute and decide now (settings changed, page became visible after sleep). */
  refresh(): void;
  days(): ThreeDays | null;
  /** Most recent fired key, for the debug panel. */
  lastFired(): FiredKey | null;
}

/** Only these settings change the times; everything else is read fresh each tick. */
const timesSignature = (s: Settings) => JSON.stringify([s.location, s.calc]);

export function createScheduler(deps: {
  clock: Clock;
  store: KeyValueStore;
  getSettings: () => Settings;
  onEvent: (e: SchedulerEvent) => void;
  /** Called after every tick's decisions; drives the once-a-second UI update. */
  onTick?: (now: Date, days: ThreeDays | null) => void;
  /** Unexpected errors; reported once per distinct message so a stuck fault can't flood the log. */
  onError?: (message: string, error: unknown) => void;
}): Scheduler {
  const { clock, store, getSettings, onTick } = deps;
  let handle: TimerHandle | null = null;
  let days: ThreeDays | null = null;
  let signature: string | null = null;
  let lastError: string | null = null;
  // In memory as well as persisted: a store that can't write must not cause repeats.
  let fired = parseFiredList(store.get(KEYS.lastFired));
  const alerted = new Set<FiredKey>();
  const checked = new Set<FiredKey>();

  const report = (message: string, error: unknown) => {
    const text = `${message}: ${String(error)}`;
    if (text === lastError) return;
    lastError = text;
    deps.onError?.(message, error);
  };

  const emit = (e: SchedulerEvent) => {
    try {
      deps.onEvent(e);
    } catch (err) {
      report(`onEvent(${e.type}) threw`, err);
    }
  };

  const recompute = (now: Date, s: Settings) => {
    signature = timesSignature(s);
    if (!s.location) {
      if (days !== null) {
        days = null;
        emit({ type: 'day', days: null, firedAt: now });
      }
      return;
    }
    const today = dateKeyInZone(now, s.location.tz);
    days = {
      yesterday: computeDay(addDays(today, -1), s.location, s.calc),
      today: computeDay(today, s.location, s.calc),
      tomorrow: computeDay(addDays(today, 1), s.location, s.calc),
    };
    emit({ type: 'day', days, firedAt: now });
  };

  const markFired = (e: DuePrayer) => {
    fired = [...fired, { key: e.key, at: e.at.getTime() }].slice(-FIRED_HISTORY);
    try {
      store.set(KEYS.lastFired, JSON.stringify(fired));
    } catch (err) {
      report('could not persist fired azans', err);
    }
  };

  const emitLead = (
    type: 'preAlert' | 'healthCheck',
    seen: Set<FiredKey>,
    upcoming: DuePrayer[],
    now: Date,
  ) => {
    for (const up of upcoming) {
      if (seen.has(up.key)) continue;
      seen.add(up.key);
      if (seen.size > FIRED_HISTORY) seen.delete(seen.values().next().value!);
      emit({ type, firedAt: now, ...up });
    }
  };

  const decide = (now: Date) => {
    const s = getSettings();
    if (!s.location) {
      recompute(now, s);
      return;
    }
    if (
      !days ||
      signature !== timesSignature(s) ||
      days.today.dateKey !== dateKeyInZone(now, s.location.tz)
    ) {
      recompute(now, s);
    }
    const current = days!;
    const enabled = s.azan.enabled;
    const due = getDuePrayer({
      now,
      days: current,
      fired,
      enabled,
      lateWindowMs: s.azan.lateWindowSec * 1000,
    });
    if (due) {
      // Record before notifying: a crash or reload mid-azan must not replay it.
      markFired(due);
      emit({ type: 'azan', firedAt: now, ...due });
    }
    if (s.azan.preAlertMin > 0) {
      const leadMs = s.azan.preAlertMin * 60_000;
      emitLead('preAlert', alerted, getUpcoming({ now, days: current, enabled, leadMs }), now);
    }
    emitLead(
      'healthCheck',
      checked,
      getUpcoming({ now, days: current, enabled, leadMs: HEALTH_CHECK_LEAD_MS }),
      now,
    );
  };

  const tick = () => {
    const now = clock.now();
    try {
      decide(now);
    } catch (err) {
      report('scheduler tick failed', err);
    }
    try {
      onTick?.(now, days);
    } catch (err) {
      report('onTick threw', err);
    }
  };

  return {
    start() {
      if (handle !== null) return;
      // Install the interval first so a failing first tick can't stop the loop.
      handle = clock.setInterval(tick, TICK_MS);
      tick();
    },
    stop() {
      if (handle !== null) clock.clearInterval(handle);
      handle = null;
    },
    refresh() {
      signature = null;
      tick();
    },
    days: () => days,
    lastFired: () => fired.at(-1)?.key ?? null,
  };
}
