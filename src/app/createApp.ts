// Wires the pure core to the ports and owns the app state (brief §4). The
// only place that knows about every module; views receive state + callbacks.
import { settingsSchema, type Settings } from '../config/schema';
import { createLogger, type Logger } from '../core/logger';
import { periodAt, type PeriodInfo, type ThreeDays } from '../core/period';
import type {
  BlobStore,
  Clock,
  KeyValueStore,
  MediaPlayer,
  Rng,
  WakeLockPort,
} from '../core/ports';
import type { AzanPrayer } from '../core/prayerTimes';
import { createScheduler, type SchedulerEvent } from '../core/scheduler';
import { loadSettings, saveSettings } from '../core/storage';
import { createStore } from './store';

export interface AppDeps {
  root: HTMLElement;
  doc: Document;
  clock: Clock;
  store: KeyValueStore;
  blobs: BlobStore;
  rng: Rng;
  /** Creates the single persistent audio element; called once, at the Start tap. */
  createPlayer: () => MediaPlayer;
  wakeLock: WakeLockPort;
}

export interface ActiveAzan {
  prayer: AzanPrayer;
  key: string;
  at: Date;
}

export interface AppState {
  settings: Settings;
  now: Date;
  days: ThreeDays | null;
  period: PeriodInfo | null;
  needsLocation: boolean;
  azan: ActiveAzan | null;
}

export interface App {
  state(): AppState;
  subscribe(fn: (s: AppState) => void): () => void;
  /** Validates, persists and applies a settings change; throws if invalid. */
  updateSettings(patch: Partial<Settings>): void;
  endAzan(): void;
  log: Logger;
  dispose(): void;
}

export function createApp(deps: AppDeps): App {
  const log = createLogger(deps.store, deps.clock);
  const settings = loadSettings(deps.store, (msg, detail) => log.warn(msg, detail));
  const store = createStore<AppState>({
    settings,
    now: deps.clock.now(),
    days: null,
    period: null,
    needsLocation: settings.location === null,
    azan: null,
  });

  const withPeriod = (
    now: Date,
    days: ThreeDays | null,
  ): Pick<AppState, 'now' | 'days' | 'period'> => ({
    now,
    days,
    period: days ? periodAt(now, days) : null,
  });

  const onEvent = (e: SchedulerEvent) => {
    if (e.type === 'day') {
      store.update(withPeriod(e.firedAt, e.days));
    } else if (e.type === 'azan') {
      log.info('azan', { key: e.key });
      store.update({ azan: { prayer: e.prayer, key: e.key, at: e.at } });
    }
  };

  const scheduler = createScheduler({
    clock: deps.clock,
    store: deps.store,
    getSettings: () => store.get().settings,
    onEvent,
    onTick: (now, days) => store.update(withPeriod(now, days)),
  });

  const onVisibility = () => {
    if (deps.doc.visibilityState !== 'hidden') scheduler.refresh();
  };
  deps.doc.addEventListener('visibilitychange', onVisibility);

  scheduler.start();
  log.info('app started');

  return {
    state: () => store.get(),
    subscribe: (fn) => store.subscribe(fn),
    updateSettings(patch) {
      const next = settingsSchema.parse({ ...store.get().settings, ...patch });
      saveSettings(deps.store, next);
      store.update({ settings: next, needsLocation: next.location === null });
      scheduler.refresh();
      if (!next.location) store.update(withPeriod(deps.clock.now(), null));
    },
    endAzan() {
      store.update({ azan: null });
    },
    log,
    dispose() {
      scheduler.stop();
      deps.doc.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
