// Bootstrap: the only module that creates real browser adapters (brief §3, §16).
import { createWebAudioChime } from './adapters/chime';
import { browserClock } from './adapters/clock';
import { createIdbBlobStore } from './adapters/idbBlobStore';
import { createLocalStore } from './adapters/localStore';
import { createAudioElementPlayer } from './adapters/media';
import { mathRng } from './adapters/rng';
import { createBrowserWakeLock } from './adapters/wakeLock';
import { createApp } from './app/createApp';
import './styles/base.css';
import './styles/components.css';
import './styles/views.css';

const root = document.getElementById('app');
if (!root) throw new Error('#app root missing from index.html');

if (import.meta.env.DEV && location.pathname === '/styleguide') {
  // Dev-only visual review surface; tree-shaken out of production builds.
  void import('./ui/styleguide').then((m) => m.mountStyleguide(root));
} else {
  start(root);
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
  });
}
