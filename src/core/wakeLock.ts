// Screen Wake Lock as a progressive enhancement only (brief §7b). On the target
// iPad (iPadOS 15.8) the API does not exist: the screen stays on through the
// Auto-Lock settings, so the job here is to show a one-time hint about them.
import type { Logger } from './logger';
import type { KeyValueStore, WakeLockPort } from './ports';
import { KEYS } from './storage';

export type WakeLockStatus = 'idle' | 'unsupported' | 'held' | 'released' | 'denied';

export interface WakeLockManager {
  /** After the Start tap. */
  acquire(): Promise<void>;
  /** On visibilitychange → visible (the browser drops locks when hidden). */
  reacquire(): Promise<void>;
}

export function createWakeLockManager(deps: {
  port: WakeLockPort;
  store: KeyValueStore;
  log: Logger;
  /** Show the Auto-Lock hint; called at most once per install. */
  onHint: () => void;
  onChange: (s: WakeLockStatus) => void;
}): WakeLockManager {
  let status: WakeLockStatus = 'idle'; // mirrored into app state via onChange
  let wanted = false;

  const set = (s: WakeLockStatus) => {
    status = s;
    deps.onChange(s);
  };

  const hintOnce = () => {
    if (deps.store.get(KEYS.wakeHintShown) === '1') return;
    deps.store.set(KEYS.wakeHintShown, '1');
    deps.onHint();
  };

  const request = async () => {
    if (!deps.port.supported) {
      set('unsupported');
      hintOnce();
      return;
    }
    try {
      const s = await deps.port.request();
      s.onRelease(() => set('released'));
      set('held');
    } catch (e) {
      deps.log.warn('wake lock request rejected', String(e));
      set('denied');
      hintOnce();
    }
  };

  return {
    async acquire() {
      wanted = true;
      if (status === 'held') return;
      await request();
    },
    async reacquire() {
      if (!wanted || !deps.port.supported || status === 'held') return;
      await request();
    },
  };
}
