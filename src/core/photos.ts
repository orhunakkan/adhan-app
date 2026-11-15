// Photo slides for the screensaver (brief §9). IndexedDB reads are async, so the
// next photo is prepared ahead; a slide asked for before it is ready returns
// null (the screensaver shows a panel instead). Every object URL is revoked
// when its slide is released — leaks are the main cause of iOS reloading the page.
import type { BlobStore, ObjectUrls } from './ports';

export interface PhotoSlide extends HTMLElement {
  release?: () => void;
}

export function createPhotoSource(deps: {
  blobs: BlobStore;
  objectUrls: ObjectUrls;
  keys: () => readonly string[];
  doc: Document;
}) {
  let prepared: { key: string; url: string } | null = null;
  let loading: string | null = null;
  /** Photos are counted on their own (photo 0, 1, 2…), independent of panels. */
  let nextOrdinal = 0;

  const prepare = (key: string) => {
    if (loading === key || prepared?.key === key) return;
    loading = key;
    void deps.blobs.get(key).then(
      (blob) => {
        if (loading !== key) return;
        loading = null;
        if (!blob) return;
        if (prepared) deps.objectUrls.revoke(prepared.url);
        prepared = { key, url: deps.objectUrls.create(blob) };
      },
      () => {
        if (loading === key) loading = null;
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
      const keys = deps.keys();
      if (!keys.length) return null;
      const key = keys[nextOrdinal % keys.length]!;
      if (prepared?.key !== key) {
        prepare(key);
        return null;
      }
      const el = build(prepared.url);
      prepared = null;
      nextOrdinal += 1;
      prepare(keys[nextOrdinal % keys.length]!);
      return el;
    },
    /** Starts loading the next photo during clock time so it is ready for its slide. */
    prime(): void {
      const keys = deps.keys();
      if (keys.length) prepare(keys[nextOrdinal % keys.length]!);
    },
    /** Revokes the prepared-but-unused URL (settings changed, app disposed). */
    reset() {
      loading = null;
      if (prepared) deps.objectUrls.revoke(prepared.url);
      prepared = null;
    },
  };
}
