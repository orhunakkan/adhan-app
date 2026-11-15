import type { KeyValueStore } from '../core/ports';

/**
 * KeyValueStore over localStorage. Safari throws on access in some modes
 * (private browsing, storage full); failures become null reads / no-op writes
 * so a storage problem never takes the clock down.
 */
export function createLocalStore(storage?: Storage): KeyValueStore {
  // Even reading `window.localStorage` can throw (SecurityError), so it is
  // resolved inside each guarded call rather than as a default parameter.
  const s = () => storage ?? window.localStorage;
  return {
    get(key) {
      try {
        return s().getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        s().setItem(key, value);
      } catch {
        // Quota or access error: keep running with in-memory state.
      }
    },
    remove(key) {
      try {
        s().removeItem(key);
      } catch {
        // Same as set().
      }
    },
  };
}
