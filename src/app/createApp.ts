// Wires the pure core to the ports and owns the app state (brief §4). The
// only place that knows about every module; views receive state + callbacks.
import { settingsSchema, type Settings } from '../config/schema';
import { createAudioController, type AudioState } from '../core/audio';
import { blobBytes } from '../core/blobUsage';
import { checkUpload, unreferencedBlobKeys, UploadError } from '../core/uploads';
import { createLogger, type LogEntry, type Logger } from '../core/logger';
import { nightDimState, type NightDimState } from '../core/nightDim';
import { periodAt, type PeriodInfo, type ThreeDays } from '../core/period';
import type {
  BlobStore,
  ChimePort,
  Clock,
  GeolocationPort,
  ServiceWorkerPort,
  KeyValueStore,
  MediaPlayer,
  ObjectUrls,
  Rng,
  WakeLockPort,
} from '../core/ports';
import type { City } from '../core/cities';
import type { AzanPrayer } from '../core/prayerTimes';
import { createScheduler, type PrayerEvent, type SchedulerEvent } from '../core/scheduler';
import { formatTime } from '../core/time';
import { canApplyUpdate } from '../core/updateGate';
import { createWakeLockManager, type WakeLockStatus } from '../core/wakeLock';
import { applyTokens } from '../design/tokens';
import { applyLocale, INTL_LOCALE, t } from '../i18n';
import { KEYS, loadSettings, saveSettings } from '../core/storage';
import { mountAzanView } from '../ui/azanView';
import { mountBackground } from '../ui/background';
import { mountClockView } from '../ui/clockView';
import { debugSection } from '../ui/debugPanel';
import { mountNextPrayerCard } from '../ui/nextPrayerCard';
import { mountPreAlert } from '../ui/preAlert';
import { mountKiosk } from '../ui/kiosk';
import { aboutSection } from '../ui/settings/about';
import { azanSection } from '../ui/settings/azan';
import { calculationSection } from '../ui/settings/calculation';
import { displaySection } from '../ui/settings/display';
import { locationSection } from '../ui/settings/location';
import { mountSettings, type SettingsView } from '../ui/settings/shell';
import { mountTimeline } from '../ui/timeline';
import { mountLayout } from '../ui/layout';
import { mountOverlay, type OverlayKind } from '../ui/startOverlay';
import { mountToast } from '../ui/toast';
import { createStore } from './store';

export interface AppDeps {
  root: HTMLElement;
  doc: Document;
  /** Window-level events (pageshow). */
  win: Pick<Window, 'addEventListener' | 'removeEventListener' | 'matchMedia'>;
  clock: Clock;
  store: KeyValueStore;
  blobs: BlobStore;
  rng: Rng;
  /** Creates the single persistent audio element; called once, at the Start tap. */
  createPlayer: () => MediaPlayer;
  chime: ChimePort;
  objectUrls: ObjectUrls;
  wakeLock: WakeLockPort;
  geolocation: GeolocationPort;
  /** Fetches and parses public/data/cities.json (lazy). */
  loadCities: () => Promise<City[]>;
  /** navigator.storage.persist, when the browser has it (iOS 15.2+); asked once after Start. */
  persistStorage?: () => Promise<boolean>;
  serviceWorker?: ServiceWorkerPort;
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
  /** Pre-alert banner for an upcoming prayer (brief §6), cleared when it arrives. */
  preAlert: { prayer: AzanPrayer; at: Date } | null;
  audio: AudioState;
  /** True until the Start tap, and again after a bfcache restore (the unlock is lost). */
  startRequired: boolean;
  overlay: OverlayKind;
  wakeLock: WakeLockStatus;
  nightDim: NightDimState;
  /** prefers-reduced-motion: no breathing or drift; plain fades. */
  reducedMotion: boolean;
  /** A new service worker is waiting (brief §11). */
  updateAvailable: boolean;
  lastHealthCheck: { at: Date; ok: boolean } | null;
}

export interface DebugInfo {
  version: string;
  serviceWorker: 'unsupported' | 'registered' | 'update waiting';
  lastFired: string | null;
  reloads: number;
  log: readonly LogEntry[];
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
  /** Stops a settings "Test azan" playback only. */
  stopTest(): void;
  /** Applies a waiting service worker if the update gate allows it now. */
  applyUpdate(): void;
  debug(): DebugInfo;
  testAudio(source: string): Promise<void>;
  log: Logger;
  dispose(): void;
}

/** How long the azan moment stays on screen when no audio can play. */
export const SILENT_AZAN_MS = 3 * 60_000;
/** Upper bound on an azan moment, whatever the audio does: the app can never stay stuck in it. */
export const MAX_AZAN_MS = 20 * 60_000;
/** A queued azan (coincident prayers) still plays if it is at most this old. */
const QUEUE_MAX_AGE_MS = 25 * 60_000;
/** After "Tap to enable azan", an azan this recent is replayed. */
const REPLAY_WINDOW_MS = 5 * 60_000;

function overlayFor(startRequired: boolean, audio: AudioState): OverlayKind {
  // Blocked is the loud one and wins over a plain Start (e.g. after a bfcache restore).
  if (audio.status === 'blocked') return 'enableAzan';
  if (startRequired || audio.status === 'locked') return 'start';
  if (audio.status === 'interrupted') return 'resume';
  return null;
}

export function createApp(deps: AppDeps): App {
  const log = createLogger(deps.store, deps.clock);
  /** Page loads since install: the leak signal on an iPad without Web Inspector (brief §14). */
  const reloads = (() => {
    const n = Number(deps.store.get(KEYS.reloads) ?? '0');
    const next = (Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0) + 1;
    deps.store.set(KEYS.reloads, String(next));
    return next - 1;
  })();
  const settings = loadSettings(deps.store, (msg, detail) => log.warn(msg, detail));
  const initialAudio: AudioState = { status: 'locked', phase: null, prayer: null, missing: [] };
  const store = createStore<AppState>(
    {
      settings,
      now: deps.clock.now(),
      days: null,
      period: null,
      needsLocation: settings.location === null,
      azan: null,
      preAlert: null,
      audio: initialAudio,
      startRequired: true,
      overlay: 'start',
      wakeLock: 'idle',
      nightDim: { active: false, opacity: 0 },
      reducedMotion: false,
      updateAvailable: false,
      lastHealthCheck: null,
    },
    // Views subscribe to this store; a throwing view is logged, never propagated.
    (e) => log.error('view listener threw', String(e)),
  );
  const queue: PrayerEvent[] = [];
  let uploads = 0;
  /** A fresh blob key for uploaded audio ('a…'); unique even within one millisecond. */
  const newBlobKey = () => `a${deps.clock.now().getTime().toString(36)}${(uploads++).toString(36)}`;
  let lastUpdateCheck: string | null = null;
  let citiesPromise: Promise<City[]> | null = null;
  let persistAsked = false;
  /** Keeps uploads and settings from being evicted (brief §11); asked once. */
  const requestPersistence = () => {
    if (!deps.persistStorage || persistAsked) return;
    persistAsked = true;
    deps.persistStorage().then(
      (granted) => log.info('persistent storage', { granted }),
      (err: unknown) => log.warn('persistent storage request failed', String(err)),
    );
  };
  /** When the current azan moment appeared (checked on every tick, no long timers). */
  let azanShownAt = 0;
  /** Audio was asked to play the current azan moment. */
  let azanAudio = false;
  /** A Start/Enable tap is in progress (guards against double taps). */
  let tapping: Promise<void> | null = null;
  /** The unlock inside a tap is running: its "ready" must not close the moment it may replay. */
  let unlocking = false;

  const setOverlay = () => {
    const s = store.get();
    const overlay = overlayFor(s.startRequired, s.audio);
    if (overlay !== s.overlay) store.update({ overlay });
  };

  const main = deps.doc.createElement('div');
  main.className = 'app-main';
  deps.root.append(main);
  const layout = mountLayout(main, (q) => deps.win.matchMedia(q));
  const background = mountBackground(deps.root, deps.doc);
  const clockView = mountClockView(layout.clock, () => late.settings?.open('location'));
  const nextCard = mountNextPrayerCard(layout.next);
  const timeline = mountTimeline(layout.timeline);
  const preAlert = mountPreAlert(main);
  const kiosk = mountKiosk(deps.root, { shifted: layout.root, rng: deps.rng, doc: deps.doc });
  const reducedMotion = deps.win.matchMedia('(prefers-reduced-motion: reduce)');
  const onMotion = () => store.update({ reducedMotion: reducedMotion.matches });
  reducedMotion.addEventListener('change', onMotion);
  const azanView = mountAzanView(deps.root, {
    onStop: () => app.stopAzan(),
    position: () => audio.position(),
  });
  const overlayView = mountOverlay(deps.root, {
    onStart: () => void app.tapStart(),
    onEnable: () => void app.tapStart(),
    onResume: () => void app.resume(),
    onError: (err) => log.error('overlay failed to render', { err: String(err) }),
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

  const playCurrent = async (prayer: AzanPrayer) => {
    azanAudio = true;
    try {
      await audio.playAzan(prayer);
    } catch (err) {
      log.error('playAzan failed', String(err));
    }
  };

  /** The one way an azan moment ends: hide it, optionally stop audio, then start the next queued one. */
  const closeAzan = (stopAudio: boolean) => {
    if (!store.get().azan) return;
    azanAudio = false;
    store.update({ azan: null });
    if (stopAudio) audio.stop();
    const now = deps.clock.now().getTime();
    while (queue.length) {
      const next = queue.shift()!;
      if (now - next.at.getTime() <= QUEUE_MAX_AGE_MS) {
        startAzan(next);
        return;
      }
      log.warn('queued azan too old; skipped', { key: next.key });
    }
  };

  const startAzan = (e: PrayerEvent) => {
    // The azan takes over: Settings (which sits above it) closes and re-locks.
    late.settings?.close();
    azanShownAt = deps.clock.now().getTime();
    azanAudio = false;
    store.update({ azan: { prayer: e.prayer, key: e.key, at: e.at } });
    // Never unlocked: nothing can sound; show the moment, then return to the clock.
    // (After a bfcache restore the element may still be allowed: try, and a
    // NotAllowedError raises the loud overlay.)
    if (audio.state().status === 'locked') return;
    void playCurrent(e.prayer);
  };

  /** Ends a moment that outlived its limit; runs on the 1 s tick. */
  const checkAzanAge = (now: Date) => {
    if (!store.get().azan) return;
    const limit = azanAudio ? MAX_AZAN_MS : SILENT_AZAN_MS;
    if (now.getTime() - azanShownAt < limit) return;
    if (azanAudio)
      log.warn('azan moment hit the safety cap; ending it', { key: store.get().azan?.key });
    closeAzan(true);
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
      store.update({ audio: a });
      setOverlay();
      // Audio went idle (ended, chime done, stopped): close the moment.
      if (azanAudio && !unlocking && a.phase === null && a.status === 'ready') closeAzan(false);
    },
  });

  const withPeriod = (now: Date, days: ThreeDays | null) => {
    const s = store.get();
    return {
      now,
      days,
      period: days ? periodAt(now, days) : null,
      nightDim: days
        ? nightDimState({
            now,
            days,
            settings: s.settings.display.nightDim,
            azanActive: Boolean(s.azan),
          })
        : { active: false, opacity: 0 },
    };
  };

  const onEvent = (e: SchedulerEvent) => {
    if (e.type === 'day') {
      store.update(withPeriod(e.firedAt, e.days));
      // Once per calendar day: the kiosk never navigates, so ask for new deploys.
      const day = e.days?.today.dateKey;
      if (day && day !== lastUpdateCheck) {
        if (lastUpdateCheck !== null) deps.serviceWorker?.checkForUpdate();
        lastUpdateCheck = day;
      }
    } else if (e.type === 'azan') {
      log.info('azan', { key: e.key });
      if (store.get().azan) queue.push(e);
      else startAzan(e);
    } else if (e.type === 'preAlert') {
      store.update({ preAlert: { prayer: e.prayer, at: e.at } });
    } else if (e.type === 'healthCheck') {
      void audio.healthCheck().then((ok) => {
        store.update({ lastHealthCheck: { at: deps.clock.now(), ok } });
        if (!ok) log.warn('health check failed', { before: e.key });
      });
    }
  };

  const scheduler = createScheduler({
    clock: deps.clock,
    store: deps.store,
    getSettings: () => store.get().settings,
    onEvent,
    onTick: (now, days) => {
      const pre = store.get().preAlert;
      store.update({
        ...withPeriod(now, days),
        ...(pre && now >= pre.at ? { preAlert: null } : {}),
      });
      checkAzanAge(now);
    },
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

  const applyDisplay = (s: Settings) => {
    applyTokens(deps.doc.documentElement, s.display.theme);
    applyLocale(deps.doc, s.display.language);
    if (s.display.glass) deps.doc.documentElement.dataset.glass = '';
    else delete deps.doc.documentElement.dataset.glass;
  };
  applyDisplay(settings);
  let lastDisplay = settings.display;
  let lastAzan = settings.azan;
  /**
   * Deletes stored files nothing refers to: audio no prayer (or the dua) uses
   * any more, and photos/thumbnails left by the removed screensaver (ADR-0007).
   * Runs at startup and whenever the azan settings change; a referenced audio
   * blob is never deleted. `leftoversOnly` (startup) also spares
   * uploaded audio ('a…' keys): if stored settings were ever lost and reset to
   * defaults, a startup pass must not also delete the owner's recordings.
   * Unused audio is removed only after the owner changes the azan settings.
   */
  const pruneBlobs = async (leftoversOnly = false) => {
    try {
      const unused = unreferencedBlobKeys(await deps.blobs.keys(), store.get().settings).filter(
        (key) => !leftoversOnly || !key.startsWith('a'),
      );
      for (const key of unused) await deps.blobs.delete(key);
      if (unused.length) log.info('unreferenced files deleted', { count: unused.length });
    } catch (err) {
      log.warn('file cleanup failed', String(err));
    }
  };
  store.subscribe((s) => {
    if (s.settings.azan !== lastAzan) {
      lastAzan = s.settings.azan;
      void pruneBlobs();
    }
    if (s.settings.display !== lastDisplay) {
      lastDisplay = s.settings.display;
      applyDisplay(s.settings);
    }
  });
  store.subscribe((s) =>
    overlayView.render({ overlay: s.overlay, lang: s.settings.display.language }),
  );
  overlayView.render({ overlay: 'start', lang: settings.display.language });
  // Assigned after `app` exists (the settings sheet drives it); renders skip it until then.
  const late: { settings?: SettingsView } = {};
  const renderViews = (s: AppState) => {
    background.render(s);
    clockView.render(s);
    nextCard.render(s);
    timeline.render(s);
    preAlert.render(s);
    azanView.render(s);
    kiosk.render(s);
    late.settings?.render(s);
  };
  store.subscribe(renderViews);
  renderViews(store.get());

  const app: App = {
    state: () => store.get(),
    subscribe: (fn) => store.subscribe(fn),
    updateSettings(patch) {
      const next = settingsSchema.parse({ ...store.get().settings, ...patch });
      saveSettings(deps.store, next);
      store.update({ settings: next, needsLocation: next.location === null });
      scheduler.refresh();
    },
    tapStart() {
      // A double tap must not run two unlocks (or two replays).
      tapping ??= (async () => {
        try {
          unlocking = true;
          let ok: boolean;
          try {
            ok = await audio.unlock();
          } finally {
            unlocking = false;
          }
          if (!ok) return;
          store.update({ startRequired: false });
          setOverlay();
          log.info('audio unlocked');
          void wakeLock.acquire();
          requestPersistence();
          const current = store.get().azan;
          if (!current || audio.state().status === 'playing') return;
          if (deps.clock.now().getTime() - current.at.getTime() <= REPLAY_WINDOW_MS) {
            await playCurrent(current.prayer);
          } else {
            closeAzan(false);
          }
        } finally {
          tapping = null;
        }
      })();
      return tapping;
    },
    resume: () => audio.resume(),
    stopAzan() {
      if (store.get().azan) closeAzan(true);
      else audio.stop();
    },
    applyUpdate() {
      const s = store.get();
      if (!s.updateAvailable || !deps.serviceWorker) return;
      const decision = s.days
        ? canApplyUpdate({ now: deps.clock.now(), days: s.days, azanPlaying: Boolean(s.azan) })
        : ({ allowed: true } as const);
      if (decision.allowed) {
        log.info('applying update');
        deps.serviceWorker.applyUpdate();
        return;
      }
      const lang = s.settings.display.language;
      const until =
        decision.reason === 'prayer-soon'
          ? decision.until
          : new Date(deps.clock.now().getTime() + 5 * 60_000);
      const time = formatTime(until, {
        tz: s.settings.location?.tz ?? 'UTC',
        hour12: s.settings.display.hour12,
        seconds: false,
        locale: INTL_LOCALE[lang],
      });
      log.info('update blocked by the update gate', { reason: decision.reason });
      toast.show({ message: t(lang, 'update.blocked', { time }), durationMs: 10_000 });
      // Offer it again once the message has been read.
      deps.clock.setTimeout(showUpdateToast, 10_000);
    },
    debug: () => ({
      version: __APP_VERSION__,
      serviceWorker: !deps.serviceWorker
        ? 'unsupported'
        : store.get().updateAvailable
          ? 'update waiting'
          : 'registered',
      lastFired: scheduler.lastFired(),
      reloads,
      log: log.entries(),
    }),
    stopTest() {
      if (audio.state().phase === 'test') audio.stop();
    },
    testAudio: (source) => audio.testSource(source),
    log,
    dispose() {
      scheduler.stop();
      late.settings?.destroy();
      kiosk.destroy();
      reducedMotion.removeEventListener('change', onMotion);
      overlayView.destroy();
      layout.destroy();
      toast.destroy();
      main.remove();
      deps.doc.removeEventListener('visibilitychange', onVisibility);
      deps.win.removeEventListener('pageshow', onPageShow);
    },
  };

  late.settings = mountSettings(deps.root, {
    app,
    clock: deps.clock,
    sections: [
      locationSection,
      calculationSection,
      azanSection,
      displaySection,
      aboutSection,
      debugSection,
    ],
    services: {
      geolocation: deps.geolocation,
      // One fetch + parse of the 460 KB list per page load, however often it is asked for.
      loadCities: () =>
        (citiesPromise ??= deps.loadCities().catch((err: unknown) => {
          citiesPromise = null;
          throw err;
        })),
      saveAudio: async (file) => {
        checkUpload(file);
        const key = newBlobKey();
        try {
          await deps.blobs.set(key, file);
        } catch (err) {
          log.error('audio upload failed', String(err));
          throw new UploadError('storageFull');
        }
        log.info('audio uploaded', { key, bytes: file.size });
        return `user:${key}`;
      },
      storageUsed: () => blobBytes(deps.blobs),
      clearFiles: async () => {
        for (const key of await deps.blobs.keys()) await deps.blobs.delete(key);
        log.info('all uploaded files deleted');
      },
    },
    matchMedia: (q) => deps.win.matchMedia(q),
    toast: (message) => toast.show({ message }),
  });

  // Settings are loaded: clear out old photos and thumbnails (audio is kept; see pruneBlobs).
  void pruneBlobs(true);

  /** Update toast: stays up until tapped; the tap is gated so a reload never lands near an azan. */
  const UPDATE_TOAST_MS = 24 * 3_600_000;
  const showUpdateToast = () => {
    const lang = store.get().settings.display.language;
    toast.show({
      message: t(lang, 'update.available'),
      durationMs: UPDATE_TOAST_MS,
      action: { label: t(lang, 'update.apply'), onClick: () => app.applyUpdate() },
    });
  };
  deps.serviceWorker?.register(() => {
    log.info('update waiting');
    store.update({ updateAvailable: true });
    showUpdateToast();
  });

  onMotion();
  scheduler.start();
  log.info('app started');
  return app;
}
