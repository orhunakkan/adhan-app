import { createStore, del, get, keys, set, type UseStore } from 'idb-keyval';
import type { BlobStore } from '../core/ports';

/**
 * BlobStore over IndexedDB (idb-keyval), for uploaded azan audio and photos.
 * Safari can close a long-lived connection (after the device sleeps, or under
 * memory pressure) without firing `close`, leaving every later call failing
 * with InvalidStateError. Each operation therefore retries once on a freshly
 * opened connection; all operations are idempotent, so a retry is safe.
 */
export function createIdbBlobStore(
  dbName = 'adhan-app',
  storeName = 'blobs',
  open: (db: string, store: string) => UseStore = createStore,
): BlobStore {
  let store = open(dbName, storeName);
  const run = async <T>(op: (s: UseStore) => Promise<T>): Promise<T> => {
    try {
      return await op(store);
    } catch {
      store = open(dbName, storeName);
      return op(store);
    }
  };
  return {
    get: (key) => run((s) => get<Blob>(key, s)),
    set: (key, value) => run((s) => set(key, value, s)),
    delete: (key) => run((s) => del(key, s)),
    keys: () => run(async (s) => (await keys<IDBValidKey>(s)).map(String)),
  };
}
