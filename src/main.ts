// Bootstrap: the only module that creates real browser adapters (brief §3, §16).
import { createWebAudioChime } from './adapters/chime';
import { browserClock } from './adapters/clock';
import { createBrowserGeolocation } from './adapters/geolocation';
import { createCanvasPhotoProcessor } from './adapters/photoResize';
import { createIdbBlobStore } from './adapters/idbBlobStore';
import { createLocalStore } from './adapters/localStore';
import { createAudioElementPlayer } from './adapters/media';
import { mathRng } from './adapters/rng';
import { createServiceWorker } from './adapters/sw';
import { createBrowserWakeLock } from './adapters/wakeLock';
import { createApp } from './app/createApp';
import { parseCities } from './core/cities';
import { mountDiagnostics } from './ui/diagnostics';
import './styles/base.css';
import './styles/components.css';
import './styles/views.css';

const root = document.getElementById('app');
if (!root) throw new Error('#app root missing from index.html');

if (import.meta.env.DEV && location.pathname === '/styleguide') {
  // Dev-only visual review surface; tree-shaken out of production builds.
  void import('./ui/styleguide').then((m) => m.mountStyleguide(root));
} else {
  // `?diag`: an on-screen panel for debugging on the iPad without a Mac.
  const diag = new URLSearchParams(location.search).has('diag')
    ? mountDiagnostics(document, window)
    : null;
  try {
    start(root);
  } catch (err) {
    diag?.record(`start failed: ${String(err)}`);
    throw err;
  }
  if (diag) {
    diag.update();
    setInterval(() => diag.update(), 1000);
  }
}

function start(root: HTMLElement) {
  createApp({
    root,
    doc: document,
    win: window,
    clock: browserClock,
    store: createLocalStore(),
    blobs: createIdbBlobStore(),
    rng: mathRng,
    createPlayer: () => createAudioElementPlayer(document),
    chime: createWebAudioChime(window),
    objectUrls: {
      create: (blob) => URL.createObjectURL(blob),
      revoke: (url) => URL.revokeObjectURL(url),
    },
    wakeLock: createBrowserWakeLock(navigator),
    geolocation: createBrowserGeolocation(navigator),
    photoProcessor: createCanvasPhotoProcessor(document),
    serviceWorker: import.meta.env.PROD ? createServiceWorker(navigator, location) : undefined,
    persistStorage:
      'storage' in navigator && 'persist' in navigator.storage
        ? () => navigator.storage.persist()
        : undefined,
    loadPanels: async () => {
      const res = await fetch('/panels/panels.json');
      if (!res.ok) throw new Error(`panels.json: ${res.status}`);
      return res.json() as Promise<unknown>;
    },
    loadCities: async () => {
      const res = await fetch('/data/cities.json');
      if (!res.ok) throw new Error(`cities.json: ${res.status}`);
      return parseCities(await res.json());
    },
  });
}
