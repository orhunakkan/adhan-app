// Wires the pure core to the ports and owns the app state (brief §4). The
// only place that knows about every module; views receive state + callbacks.
import { settingsSchema, type Settings } from '../config/schema';
import { createAudioController, type AudioState } from '../core/audio';
import { blobBytes } from '../core/blobUsage';
import { createLogger, type Logger } from '../core/logger';
import { nightDimState, type NightDimState } from '../core/nightDim';
import { periodAt, type PeriodInfo, type ThreeDays } from '../core/period';
import type {
  BlobStore,
  ChimePort,
  Clock,
  GeolocationPort,
  PhotoProcessor,
  KeyValueStore,
  MediaPlayer,
  ObjectUrls,
  Rng,
  WakeLockPort,
} from '../core/ports';
import type { City } from '../core/cities';
import { parsePanels, shuffle, type Panel } from '../core/panels';
import { createPhotoSource } from '../core/photos';
import type { AzanPrayer } from '../core/prayerTimes';
import { createScheduler, type PrayerEvent, type SchedulerEvent } from '../core/scheduler';
import { createWakeLockManager, type WakeLockStatus } from '../core/wakeLock';
import { applyTokens } from '../design/tokens';
import { applyLocale, t } from '../i18n';
import { loadSettings, saveSettings } from '../core/storage';
import { mountAzanView } from '../ui/azanView';
import { mountBackground } from '../ui/background';
import { mountClockView } from '../ui/clockView';
import { mountNextPrayerCard } from '../ui/nextPrayerCard';
import { mountPreAlert } from '../ui/preAlert';
import { mountKiosk } from '../ui/kiosk';
import { mountScreensaver } from '../ui/screensaver';
import { aboutSection } from '../ui/settings/about';
import { azanSection } from '../ui/settings/azan';
import { calculationSection } from '../ui/settings/calculation';
import { photosSection } from '../ui/settings/photos';
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
  /** Fetches public/panels/panels.json (validated here). */
  loadPanels: () => Promise<unknown>;
  photoProcessor: PhotoProcessor;
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
  /** prefers-reduced-motion: no breathing, Ken Burns or drift; plain fades. */
  reducedMotion: boolean;
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
    },
    // Views subscribe to this store; a throwing view is logged, never propagated.
    (e) => log.error('view listener threw', String(e)),
  );
  const queue: PrayerEvent[] = [];
  let uploads = 0;
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
  const clockView = mountClockView(layout.clock);
  const nextCard = mountNextPrayerCard(layout.next);
  const timeline = mountTimeline(layout.timeline);
  const preAlert = mountPreAlert(main);
  let panels: readonly Panel[] = [];
  const photos = createPhotoSource({
    blobs: deps.blobs,
    objectUrls: deps.objectUrls,
    keys: () => store.get().settings.photos,
    doc: deps.doc,
  });
  const screensaver = mountScreensaver(deps.root, {
    clock: deps.clock,
    panels: () => panels,
    photoSlide: () => photos.slide(),
    primePhotos: () => photos.prime(),
    suppressed: (s) => s.nightDim.active || (late.settings?.isOpen() ?? false),
  });
  const kiosk = mountKiosk(deps.root, { shifted: layout.root, rng: deps.rng, doc: deps.doc });
  const reducedMotion = deps.win.matchMedia('(prefers-reduced-motion: reduce)');
  const onMotion = () => store.update({ reducedMotion: reducedMotion.matches });
  reducedMotion.addEventListener('change', onMotion);
  const azanView = mountAzanView(deps.root, {
    onStop: () => app.stopAzan(),
    position: () => audio.position(),
  });
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
    } else if (e.type === 'azan') {
      log.info('azan', { key: e.key });
      if (store.get().azan) queue.push(e);
      else startAzan(e);
    } else if (e.type === 'preAlert') {
      store.update({ preAlert: { prayer: e.prayer, at: e.at } });
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
  let lastPhotos = settings.photos;
  store.subscribe((s) => {
    if (s.settings.photos !== lastPhotos) {
      lastPhotos = s.settings.photos;
      photos.reset(); // a deleted photo's prepared URL must not linger
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
    screensaver.render(s);
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
    stopTest() {
      if (audio.state().phase === 'test') audio.stop();
    },
    testAudio: (source) => audio.testSource(source),
    log,
    dispose() {
      scheduler.stop();
      late.settings?.destroy();
      screensaver.destroy();
      kiosk.destroy();
      reducedMotion.removeEventListener('change', onMotion);
      photos.reset();
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
      photosSection,
      aboutSection,
    ],
    services: {
      geolocation: deps.geolocation,
      loadCities: deps.loadCities,
      saveAudio: async (file) => {
        const key = `a${deps.clock.now().getTime().toString(36)}${(uploads++).toString(36)}`;
        await deps.blobs.set(key, file);
        log.info('audio uploaded', { key, bytes: file.size });
        return `user:${key}`;
      },
      storageUsed: () => blobBytes(deps.blobs),
      savePhotos: async (files) => {
        const keys: string[] = [];
        for (const file of files) {
          const resized = await deps.photoProcessor.resize(file);
          const key = `p${deps.clock.now().getTime().toString(36)}${(uploads++).toString(36)}`;
          await deps.blobs.set(key, resized);
          keys.push(key);
        }
        const current = store.get().settings.photos;
        app.updateSettings({ photos: [...current, ...keys] });
        log.info('photos uploaded', { count: keys.length });
      },
      deletePhoto: async (key) => {
        await deps.blobs.delete(key);
        app.updateSettings({ photos: store.get().settings.photos.filter((k) => k !== key) });
      },
      photoUrl: async (key) => {
        const blob = await deps.blobs.get(key);
        return blob ? deps.objectUrls.create(blob) : null;
      },
      revokeUrl: (url) => deps.objectUrls.revoke(url),
    },
    background: main,
    matchMedia: (q) => deps.win.matchMedia(q),
    toast: (message) => toast.show({ message }),
  });

  void deps
    .loadPanels()
    .then((json) => {
      panels = shuffle(parsePanels(json), deps.rng);
    })
    .catch((err: unknown) => log.warn('panels could not load', String(err)));

  onMotion();
  scheduler.start();
  log.info('app started');
  return app;
}
