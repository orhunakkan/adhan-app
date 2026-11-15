// Storage used (brief §11): Safari 15 has no navigator.storage.estimate(), so
// sum the sizes of the uploaded Blobs in IndexedDB.
import type { BlobStore } from './ports';

export async function blobBytes(store: BlobStore): Promise<number> {
  let total = 0;
  for (const key of await store.keys()) total += (await store.get(key))?.size ?? 0;
  return total;
}

export function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: i ? 1 : 0 }).format(v)} ${units[i]}`;
}
