// Bootstrap: the only module that creates real browser adapters (brief §3, §16).
import { browserClock } from './adapters/clock';
import { createIdbBlobStore } from './adapters/idbBlobStore';
import { createLocalStore } from './adapters/localStore';
import { createAudioElementPlayer } from './adapters/media';
import { mathRng } from './adapters/rng';
import { createBrowserWakeLock } from './adapters/wakeLock';
import { createApp } from './app/createApp';

const root = document.getElementById('app');
if (!root) throw new Error('#app root missing from index.html');

createApp({
  root,
  doc: document,
  clock: browserClock,
  store: createLocalStore(),
  blobs: createIdbBlobStore(),
  rng: mathRng,
  createPlayer: () => createAudioElementPlayer(document),
  wakeLock: createBrowserWakeLock(navigator),
});
