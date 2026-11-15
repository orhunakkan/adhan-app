// Service worker (brief §11), built by vite-plugin-pwa (injectManifest) as a
// classic script: Safari 15 has no module service workers.
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { cacheNames } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { RangeRequestsPlugin } from 'workbox-range-requests';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

interface PrecacheEntry {
  url: string;
  revision: string | null;
}

declare const self: {
  __WB_MANIFEST: PrecacheEntry[];
  skipWaiting(): Promise<void>;
  addEventListener(type: 'message', fn: (e: { data?: { type?: string } }) => void): void;
};

// Safari's media stack asks for audio with Range headers; a full 200 body can
// be refused, which would make every health check fail offline. Serve audio
// from the precache with proper 206 responses. Registered before the precache
// route so it wins for audio.
registerRoute(
  ({ request, url }) => request.destination === 'audio' || url.pathname.endsWith('.m4a'),
  new CacheFirst({
    cacheName: cacheNames.precache,
    plugins: [new CacheableResponsePlugin({ statuses: [200] }), new RangeRequestsPlugin()],
    matchOptions: { ignoreSearch: true, ignoreVary: true },
  }),
);

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// workbox-window's messageSkipWaiting(): only sent after the update gate allowed it.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
