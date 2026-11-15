import type { WakeLockPort, WakeLockSentinelLike } from '../core/ports';

interface WakeLockSentinelApi extends EventTarget {
  readonly released: boolean;
  release(): Promise<void>;
}

interface NavigatorWithWakeLock {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelApi> };
}

/** Screen Wake Lock if the browser has it (not on iPadOS 15, brief §7b). */
export function createBrowserWakeLock(nav: Navigator): WakeLockPort {
  const api = (nav as Navigator & NavigatorWithWakeLock).wakeLock;
  return {
    supported: Boolean(api),
    async request(): Promise<WakeLockSentinelLike> {
      if (!api) throw new Error('Wake Lock API not supported');
      const s = await api.request('screen');
      return {
        get released() {
          return s.released;
        },
        release: () => s.release(),
        onRelease: (fn) => s.addEventListener('release', fn),
      };
    },
  };
}
