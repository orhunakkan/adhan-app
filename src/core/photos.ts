// Photo slides for the screensaver (brief §9). IndexedDB reads are async, so the
// next photo is prepared ahead; a slide asked for before it is ready returns
// null (the screensaver shows a panel instead). Every object URL is revoked
// when its slide is released — leaks are the main cause of iOS reloading the page.
// A key whose blob is missing or unreadable is skipped (not re-requested every
// second); the set resets when the photo list changes.
import type { BlobStore, ObjectUrls } from './ports';

export interface PhotoSlide extends HTMLElement {
  release?: () => void;
}

/** Stored next to each photo by the upload flow: a small version for the settings grid. */
export const thumbKey = (key: string) => `${key}-t`;

export function createPhotoSource(deps: {
  blobs: BlobStore;
  objectUrls: ObjectUrls;
  keys: () => readonly string[];
  doc: Document;
  onMissing?: (key: string) => void;
}) {
  let prepared: { key: string; url: string } | null = null;
  let loading: string | null = null;
  /** Photos are counted on their own (photo 0, 1, 2…), independent of panels. */
  let nextOrdinal = 0;
  const bad = new Set<string>();

  /** The key for the next photo that is not known to be missing, or null if all are. */
  const nextKey = (): string | null => {
    const keys = deps.keys();
    for (let i = 0; i < keys.length; i++) {
      const key = keys[(nextOrdinal + i) % keys.length]!;
      if (!bad.has(key)) {
        nextOrdinal += i;
        return key;
      }
    }
    return null;
  };

  const markBad = (key: string) => {
    bad.add(key);
    deps.onMissing?.(key);
    // Move on so the next prime/slide prepares a different photo.
    const k = nextKey();
    if (k) prepare(k);
  };

  const prepare = (key: string) => {
    if (loading === key || prepared?.key === key || bad.has(key)) return;
    loading = key;
    void deps.blobs.get(key).then(
      (blob) => {
        if (loading !== key) return;
        loading = null;
        if (!blob) {
          markBad(key);
          return;
        }
        if (prepared) deps.objectUrls.revoke(prepared.url);
        prepared = { key, url: deps.objectUrls.create(blob) };
      },
      () => {
        if (loading !== key) return;
        loading = null;
        markBad(key);
      },
    );
  };

  const build = (url: string): PhotoSlide => {
    const el: PhotoSlide = deps.doc.createElement('div');
    el.className = 'photo';
    const img = deps.doc.createElement('img');
    img.className = 'photo__img';
    img.alt = '';
    img.decoding = 'async';
    img.src = url;
    const scrim = deps.doc.createElement('div');
    scrim.className = 'photo__scrim';
    el.append(img, scrim);
    let released = false;
    el.release = () => {
      if (released) return;
      released = true;
      img.removeAttribute('src');
      deps.objectUrls.revoke(url);
    };
    return el;
  };

  return {
    /** The next photo's slide if it is ready (and starts preparing the one after), else null. */
    slide(): PhotoSlide | null {
      const key = nextKey();
      if (!key) return null;
      if (prepared?.key !== key) {
        prepare(key);
        return null;
      }
      const el = build(prepared.url);
      prepared = null;
      nextOrdinal += 1;
      const following = nextKey();
      if (following) prepare(following);
      return el;
    },
    /** Starts loading the next photo during clock time so it is ready for its slide. */
    prime(): void {
      const key = nextKey();
      if (key) prepare(key);
    },
    /** Revokes the prepared-but-unused URL and forgets missing keys (photo list changed, app disposed). */
    reset() {
      loading = null;
      bad.clear();
      if (prepared) deps.objectUrls.revoke(prepared.url);
      prepared = null;
    },
  };
}
