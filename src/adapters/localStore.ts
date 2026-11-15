import type { KeyValueStore } from '../core/ports';

/**
 * KeyValueStore over localStorage. Safari throws on access in some modes
 * (private browsing, storage full); failures become null reads / no-op writes
 * so a storage problem never takes the clock down.
 */
export function createLocalStore(storage: Storage = window.localStorage): KeyValueStore {
  return {
    get(key) {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        storage.setItem(key, value);
      } catch {
        // Quota or access error: keep running with in-memory state.
      }
    },
    remove(key) {
      try {
        storage.removeItem(key);
      } catch {
        // Same as set().
      }
    },
  };
}
