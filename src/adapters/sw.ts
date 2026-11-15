import { Workbox } from 'workbox-window';
import type { ServiceWorkerPort } from '../core/ports';

/** workbox-window registration; the reload happens only after the user's gated tap. */
export function createServiceWorker(nav: Navigator, loc: Location): ServiceWorkerPort | undefined {
  if (!('serviceWorker' in nav)) return undefined;
  const wb = new Workbox('/sw.js', { scope: '/' });
  return {
    register(onWaiting) {
      wb.addEventListener('waiting', () => onWaiting());
      void wb.register();
    },
    applyUpdate() {
      wb.addEventListener('controlling', () => loc.reload());
      wb.messageSkipWaiting();
    },
  };
}
