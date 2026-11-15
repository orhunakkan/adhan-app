import { createStore, del, get, keys, set } from 'idb-keyval';
import type { BlobStore } from '../core/ports';

/** BlobStore over IndexedDB (idb-keyval), for uploaded azan audio and photos. */
export function createIdbBlobStore(dbName = 'adhan-app', storeName = 'blobs'): BlobStore {
  const store = createStore(dbName, storeName);
  return {
    get: (key) => get<Blob>(key, store),
    set: (key, value) => set(key, value, store),
    delete: (key) => del(key, store),
    keys: async () => (await keys<IDBValidKey>(store)).map(String),
  };
}
