// Azan scheduler (brief §6). A pure decision function plus a 1-second tick
// loop on the injected Clock. Never long timeouts: iOS throttles and drifts them.
//
// Idempotency uses the SET of recently fired keys ("YYYY-MM-DD:prayer"), with
// instants (not key order) deciding what is due. Key order is not time order at
// high latitude: adhan can put Isha(D) after Fajr(D+1) in summer, or Asr before
// Dhuhr inside the polar circle. A key fires at most once, whatever settings or
// location change in between.
//
// Known limitation: deep inside the polar circle (e.g. Utqiagvik, 71°N, polar
// night) adhan's polar resolution can return times days away from their date;
// those fall outside the three-day window and do not fire.
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
/** Deliveries retried per azan when the consumer throws (within the late window). */
export const MAX_DELIVERY_ATTEMPTS = 3;

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
  /** Epoch ms of the prayer time that fired (for the debug panel); null when unknown. */
  at: number | null;
}

/** Reads the fired list; accepts legacy plain keys; anything malformed is dropped. */
export function parseFiredList(raw: string | null): FiredEntry[] {
  if (raw === null) return [];
  if (parseFiredKey(raw)) return [{ key: raw, at: null }];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.flatMap((v: unknown): FiredEntry[] => {
      if (typeof v === 'string') return KEY_RE.test(v) ? [{ key: v, at: null }] : [];
      const e = v as { key?: unknown; at?: unknown } | null;
      if (!e || typeof e.key !== 'string' || !KEY_RE.test(e.key)) return [];
      return [{ key: e.key, at: typeof e.at === 'number' ? e.at : null }];
    });
  } catch {
    return [];
  }
}

const alreadyFired = (fired: readonly FiredEntry[], key: FiredKey) =>
  fired.some((f) => f.key === key);

const eventsCache = new WeakMap<ThreeDays, DuePrayer[]>();

/** Azan events of the three days, sorted by instant; NaN times (polar extremes) are dropped. */
function azanEvents(days: ThreeDays): DuePrayer[] {
  const cached = eventsCache.get(days);
  if (cached) return cached;
  const events = [days.yesterday, days.today, days.tomorrow]
    .flatMap((d) =>
      AZAN_PRAYERS.map((prayer) => ({ prayer, key: `${d.dateKey}:${prayer}`, at: d[prayer] })),
    )
    .filter((e) => Number.isFinite(e.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  eventsCache.set(days, events);
  return events;
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
      !alreadyFired(input.fired, e.key)
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
  /** The location's date changes on a minute boundary at the earliest: format once a minute. */
  let keyCache = { minute: Number.NaN, tz: '', key: '' };
  const todayKey = (now: Date, tz: string) => {
    const minute = Math.floor(now.getTime() / 60_000);
    if (minute !== keyCache.minute || tz !== keyCache.tz) {
      keyCache = { minute, tz, key: dateKeyInZone(now, tz) };
    }
    return keyCache.key;
  };
  const reported = new Set<string>();
  const alerted = new Set<FiredKey>();
  const checked = new Set<FiredKey>();
  const deliveries = new Map<FiredKey, number>();

  const describe = (error: unknown) => {
    try {
      return String(error);
    } catch {
      return '[unprintable error]';
    }
  };

  /** Each distinct fault is reported once; the callback can never throw into the loop. */
  const report = (message: string, error: unknown) => {
    const text = `${message}: ${describe(error)}`;
    if (reported.has(text)) return;
    if (reported.size >= 20) reported.clear();
    reported.add(text);
    try {
      deps.onError?.(message, error);
    } catch {
      // The error sink itself failed (e.g. storage full); nothing more to do.
    }
  };

  /** Last raw value seen in the store, so an unchanged list is not re-parsed every tick. */
  let lastRaw: string | null | undefined;

  const readStoredFired = (): FiredEntry[] | null => {
    let raw: string | null;
    try {
      raw = store.get(KEYS.lastFired);
    } catch (err) {
      report('could not read fired azans', err);
      return null;
    }
    if (raw === lastRaw) return null;
    lastRaw = raw;
    return parseFiredList(raw);
  };

  // In memory as well as persisted: a store that can't write must not cause repeats.
  let fired = readStoredFired() ?? [];

  /** Merges what another instance (tab) may have written, so neither replays it. */
  const syncFired = () => {
    const stored = readStoredFired();
    if (stored?.some((e) => !alreadyFired(fired, e.key))) {
      fired = [...fired, ...stored.filter((e) => !alreadyFired(fired, e.key))].slice(
        -FIRED_HISTORY,
      );
    }
  };

  const persistFired = () => {
    try {
      const raw = JSON.stringify(fired);
      store.set(KEYS.lastFired, raw);
      lastRaw = raw;
    } catch (err) {
      report('could not persist fired azans', err);
    }
  };

  const emit = (e: SchedulerEvent): boolean => {
    try {
      deps.onEvent(e);
      return true;
    } catch (err) {
      report(`onEvent(${e.type}) threw`, err);
      return false;
    }
  };

  const recompute = (now: Date, s: Settings) => {
    if (!s.location) {
      signature = timesSignature(s);
      if (days !== null) {
        days = null;
        emit({ type: 'day', days: null, firedAt: now });
      }
      return;
    }
    const today = todayKey(now, s.location.tz);
    const next: ThreeDays = {
      yesterday: computeDay(addDays(today, -1), s.location, s.calc),
      today: computeDay(today, s.location, s.calc),
      tomorrow: computeDay(addDays(today, 1), s.location, s.calc),
    };
    // Only after a successful computation: a failure is retried on the next tick.
    days = next;
    signature = timesSignature(s);
    emit({ type: 'day', days, firedAt: now });
  };

  const markFired = (e: DuePrayer) => {
    fired = [...fired, { key: e.key, at: e.at.getTime() }].slice(-FIRED_HISTORY);
    persistFired();
  };

  const unmarkFired = (key: FiredKey) => {
    fired = fired.filter((f) => f.key !== key);
    persistFired();
  };

  const emitLead = (
    type: 'preAlert' | 'healthCheck',
    seen: Set<FiredKey>,
    upcoming: DuePrayer[],
    now: Date,
  ) => {
    for (const up of upcoming) {
      if (seen.has(up.key) || alreadyFired(fired, up.key)) continue;
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
      days.today.dateKey !== todayKey(now, s.location.tz)
    ) {
      recompute(now, s);
    }
    const current = days!;
    const enabled = s.azan.enabled;
    syncFired();
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
      if (!emit({ type: 'azan', firedAt: now, ...due })) {
        // The consumer threw: un-record so a later tick in the window retries (bounded).
        const tries = (deliveries.get(due.key) ?? 0) + 1;
        deliveries.set(due.key, tries);
        if (tries < MAX_DELIVERY_ATTEMPTS) unmarkFired(due.key);
      }
      if (deliveries.size > FIRED_HISTORY) deliveries.clear();
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
