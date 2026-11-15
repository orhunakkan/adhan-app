import { defaultSettings } from '../../src/config/defaults';
import type { Settings } from '../../src/config/schema';
import { createApp, type App } from '../../src/app/createApp';
import type { Location } from '../../src/core/prayerTimes';
import { KEYS } from '../../src/core/storage';
import { SCHAUMBURG } from './days';
import { FakeClock } from './fakeClock';
import { FakeMediaPlayer } from './fakeMediaPlayer';
import { FakeWakeLock } from './fakeWakeLock';
import { MemoryBlobStore } from './memoryBlobStore';
import { MemoryStore } from './memoryStore';
import { seededRng } from './seededRng';

export interface MountOptions {
  start?: Date;
  location?: Location | null;
  settings?: Partial<Settings>;
  store?: MemoryStore;
  blobs?: MemoryBlobStore;
  wakeLock?: FakeWakeLock;
  /** Reuse an existing clock (e.g. to simulate a reload at the same moment). */
  clock?: FakeClock;
}

export interface Mounted {
  app: App;
  root: HTMLElement;
  clock: FakeClock;
  store: MemoryStore;
  blobs: MemoryBlobStore;
  wakeLock: FakeWakeLock;
  /** Every player the app asked for, in order. The app must ask exactly once. */
  players: FakeMediaPlayer[];
  get player(): FakeMediaPlayer | undefined;
  dispose(): void;
}

/**
 * Mounts the whole app into the happy-dom document with every port faked: the
 * integration harness that stands in for E2E tests (brief §13.2).
 */
export function mountApp(opts: MountOptions = {}): Mounted {
  const clock = opts.clock ?? new FakeClock(opts.start ?? new Date('2026-05-10T17:00:00Z'));
  const store = opts.store ?? new MemoryStore();
  if (!opts.store) {
    const settings: Settings = {
      ...defaultSettings,
      location: opts.location === undefined ? SCHAUMBURG : opts.location,
      calc: { ...defaultSettings.calc, method: 'NorthAmerica' },
      ...opts.settings,
    };
    store.set(KEYS.settings, JSON.stringify(settings));
  }
  const blobs = opts.blobs ?? new MemoryBlobStore();
  const wakeLock = opts.wakeLock ?? new FakeWakeLock({ supported: false });
  const players: FakeMediaPlayer[] = [];
  const root = document.createElement('div');
  root.id = 'app';
  document.body.append(root);
  const app = createApp({
    root,
    doc: document,
    clock,
    store,
    blobs,
    rng: seededRng(1),
    wakeLock,
    createPlayer: () => {
      const p = new FakeMediaPlayer();
      players.push(p);
      return p;
    },
  });
  return {
    app,
    root,
    clock,
    store,
    blobs,
    wakeLock,
    players,
    get player() {
      return players[0];
    },
    dispose() {
      app.dispose();
      root.remove();
      if (!opts.clock) clock.dispose();
    },
  };
}
