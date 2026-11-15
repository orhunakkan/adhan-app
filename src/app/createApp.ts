// Wires the pure core to the ports and owns the app state (brief §4). The
// only place that knows about every module; views receive state + callbacks.
import { settingsSchema, type Settings } from '../config/schema';
import { createAudioController, type AudioState } from '../core/audio';
import { createLogger, type Logger } from '../core/logger';
import { periodAt, type PeriodInfo, type ThreeDays } from '../core/period';
import type {
  BlobStore,
  ChimePort,
  Clock,
  KeyValueStore,
  MediaPlayer,
  ObjectUrls,
  Rng,
  TimerHandle,
  WakeLockPort,
} from '../core/ports';
import type { AzanPrayer } from '../core/prayerTimes';
import { createScheduler, type PrayerEvent, type SchedulerEvent } from '../core/scheduler';
import { createWakeLockManager, type WakeLockStatus } from '../core/wakeLock';
import { t } from '../i18n';
import { loadSettings, saveSettings } from '../core/storage';
import { mountOverlay, type OverlayKind } from '../ui/startOverlay';
import { mountToast } from '../ui/toast';
import { createStore } from './store';

export interface AppDeps {
  root: HTMLElement;
  doc: Document;
  /** Window-level events (pageshow). */
  win: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  clock: Clock;
  store: KeyValueStore;
  blobs: BlobStore;
  rng: Rng;
  /** Creates the single persistent audio element; called once, at the Start tap. */
  createPlayer: () => MediaPlayer;
  chime: ChimePort;
  objectUrls: ObjectUrls;
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
  /** The azan moment on screen, if any. */
  azan: ActiveAzan | null;
  audio: AudioState;
  /** True until the Start tap, and again after a bfcache restore (the unlock is lost). */
  startRequired: boolean;
  overlay: OverlayKind;
  wakeLock: WakeLockStatus;
}

export interface App {
  state(): AppState;
  subscribe(fn: (s: AppState) => void): () => void;
  /** Validates, persists and applies a settings change; throws if invalid. */
  updateSettings(patch: Partial<Settings>): void;
  /** The Start / "Tap to enable azan" tap. */
  tapStart(): Promise<void>;
  resume(): Promise<void>;
  stopAzan(): void;
  testAudio(source: string): Promise<void>;
  log: Logger;
  dispose(): void;
}

/** How long the azan moment stays on screen when no audio can play. */
export const SILENT_AZAN_MS = 3 * 60_000;
/** Upper bound on an azan moment, whatever the audio does: the app can never stay stuck in it. */
export const MAX_AZAN_MS = 15 * 60_000;
/** A queued azan (coincident prayers) still plays if it is at most this old. */
const QUEUE_MAX_AGE_MS = 10 * 60_000;
/** After "Tap to enable azan", an azan this recent is replayed. */
const REPLAY_WINDOW_MS = 5 * 60_000;

function overlayFor(startRequired: boolean, audio: AudioState): OverlayKind {
  if (startRequired || audio.status === 'locked') return 'start';
  if (audio.status === 'blocked') return 'enableAzan';
  if (audio.status === 'interrupted') return 'resume';
  return null;
}

export function createApp(deps: AppDeps): App {
  const log = createLogger(deps.store, deps.clock);
  const settings = loadSettings(deps.store, (msg, detail) => log.warn(msg, detail));
  const initialAudio: AudioState = { status: 'locked', phase: null, prayer: null, missing: [] };
  const store = createStore<AppState>({
    settings,
    now: deps.clock.now(),
    days: null,
    period: null,
    needsLocation: settings.location === null,
    azan: null,
    audio: initialAudio,
    startRequired: true,
    overlay: 'start',
    wakeLock: 'idle',
  });
  const queue: PrayerEvent[] = [];
  let silentTimer: TimerHandle | null = null;

  const setOverlay = () => {
    const s = store.get();
    const overlay = overlayFor(s.startRequired, s.audio);
    if (overlay !== s.overlay) store.update({ overlay });
  };

  const main = deps.doc.createElement('div');
  main.className = 'app-main';
  deps.root.append(main);
  const overlayView = mountOverlay(deps.root, {
    background: main,
    onStart: () => void app.tapStart(),
    onEnable: () => void app.tapStart(),
    onResume: () => void app.resume(),
  });
  const toast = mountToast(deps.root, deps.clock);
  const wakeLock = createWakeLockManager({
    port: deps.wakeLock,
    store: deps.store,
    log,
    onHint: () =>
      toast.show({
        message: t(store.get().settings.display.language, 'wake.hint'),
        durationMs: 20_000,
      }),
    onChange: (status) => store.update({ wakeLock: status }),
  });

  const clearSilentTimer = () => {
    if (silentTimer !== null) deps.clock.clearTimeout(silentTimer);
    silentTimer = null;
  };

  const endAzan = () => {
    clearSilentTimer();
    store.update({ azan: null });
    const next = queue.shift();
    if (next && deps.clock.now().getTime() - next.at.getTime() <= QUEUE_MAX_AGE_MS) {
      startAzan(next);
    }
  };

  const startAzan = (e: PrayerEvent) => {
    clearSilentTimer();
    store.update({ azan: { prayer: e.prayer, key: e.key, at: e.at } });
    const status = audio.state().status;
    if (status === 'locked' || store.get().startRequired) {
      // No unlock yet: show the moment, then return to the clock.
      silentTimer = deps.clock.setTimeout(endAzan, SILENT_AZAN_MS);
      return;
    }
    silentTimer = deps.clock.setTimeout(() => {
      log.warn('azan moment hit the safety cap; ending it', { key: e.key });
      audio.stop();
      endAzan();
    }, MAX_AZAN_MS);
    void audio.playAzan(e.prayer);
  };

  const audio = createAudioController({
    createPlayer: deps.createPlayer,
    blobs: deps.blobs,
    chime: deps.chime,
    objectUrls: deps.objectUrls,
    clock: deps.clock,
    log,
    getSettings: () => store.get().settings,
    onChange: (a) => {
      const wasActive = store.get().audio.phase === 'azan' || store.get().audio.phase === 'dua';
      store.update({ audio: a });
      setOverlay();
      if (wasActive && a.status === 'ready' && a.phase === null && store.get().azan) endAzan();
    },
  });

  const withPeriod = (now: Date, days: ThreeDays | null) => ({
    now,
    days,
    period: days ? periodAt(now, days) : null,
  });

  const onEvent = (e: SchedulerEvent) => {
    if (e.type === 'day') {
      store.update(withPeriod(e.firedAt, e.days));
    } else if (e.type === 'azan') {
      log.info('azan', { key: e.key });
      if (store.get().azan) queue.push(e);
      else startAzan(e);
    } else if (e.type === 'healthCheck') {
      void audio.healthCheck().then((ok) => {
        if (!ok) log.warn('health check failed', { before: e.key });
      });
    }
  };

  const scheduler = createScheduler({
    clock: deps.clock,
    store: deps.store,
    getSettings: () => store.get().settings,
    onEvent,
    onTick: (now, days) => store.update(withPeriod(now, days)),
    onError: (msg, err) => log.error(msg, String(err)),
  });

  const onVisibility = () => {
    if (deps.doc.visibilityState === 'hidden') return;
    scheduler.refresh();
    void wakeLock.reacquire();
  };
  const onPageShow = (e: Event) => {
    if ((e as PageTransitionEvent).persisted) {
      log.warn('restored from back/forward cache: unlock assumed lost');
      store.update({ startRequired: true });
      setOverlay();
      scheduler.refresh();
    }
  };
  deps.doc.addEventListener('visibilitychange', onVisibility);
  deps.win.addEventListener('pageshow', onPageShow);

  store.subscribe((s) =>
    overlayView.render({ overlay: s.overlay, lang: s.settings.display.language }),
  );
  overlayView.render({ overlay: 'start', lang: settings.display.language });

  const app: App = {
    state: () => store.get(),
    subscribe: (fn) => store.subscribe(fn),
    updateSettings(patch) {
      const next = settingsSchema.parse({ ...store.get().settings, ...patch });
      saveSettings(deps.store, next);
      store.update({ settings: next, needsLocation: next.location === null });
      scheduler.refresh();
    },
    async tapStart() {
      const ok = await audio.unlock();
      if (!ok) return;
      store.update({ startRequired: false });
      setOverlay();
      log.info('audio unlocked');
      void wakeLock.acquire();
      const current = store.get().azan;
      if (
        current &&
        audio.state().status !== 'playing' &&
        deps.clock.now().getTime() - current.at.getTime() <= REPLAY_WINDOW_MS
      ) {
        clearSilentTimer();
        void audio.playAzan(current.prayer);
      }
    },
    resume: () => audio.resume(),
    stopAzan() {
      queue.length = 0;
      audio.stop();
      if (store.get().azan) endAzan();
    },
    testAudio: (source) => audio.testSource(source),
    log,
    dispose() {
      scheduler.stop();
      clearSilentTimer();
      overlayView.destroy();
      toast.destroy();
      main.remove();
      deps.doc.removeEventListener('visibilitychange', onVisibility);
      deps.win.removeEventListener('pageshow', onPageShow);
    },
  };

  scheduler.start();
  log.info('app started');
  return app;
}
