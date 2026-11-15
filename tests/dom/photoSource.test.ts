import { describe, expect, it } from 'vitest';
import { createPhotoSource } from '../../src/core/photos';
import { MemoryBlobStore } from '../helpers/memoryBlobStore';
import { objectUrls } from '../helpers/objectUrls';

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const urls = {
  create: (b: Blob) => URL.createObjectURL(b),
  revoke: (u: string) => URL.revokeObjectURL(u),
};

async function source(keys: string[], store = new MemoryBlobStore()) {
  for (const k of keys) await store.set(k, new Blob([k]));
  let current = keys;
  const src = createPhotoSource({
    blobs: store,
    objectUrls: urls,
    keys: () => current,
    doc: document,
  });
  return { src, store, setKeys: (k: string[]) => (current = k) };
}

describe('createPhotoSource', () => {
  it('returns null until a photo is prepared, then cycles through them in order', async () => {
    const { src } = await source(['a', 'b']);
    expect(src.slide()).toBeNull();
    await flush();
    const first = src.slide()!;
    expect(first.querySelector('img')!.getAttribute('src')).toMatch(/^blob:/);
    await flush();
    expect(src.slide()).not.toBeNull(); // b
    await flush();
    expect(src.slide()).not.toBeNull(); // a again
  });

  it('release() revokes the slide URL once', async () => {
    const { src } = await source(['a']);
    src.prime();
    await flush();
    const el = src.slide()!;
    el.release!();
    el.release!();
    expect(objectUrls.revoked.filter((u) => u === objectUrls.created[0])).toHaveLength(1);
    src.reset();
  });

  it('handles no photos, a missing blob and a failing read', async () => {
    const empty = await source([]);
    empty.src.prime();
    expect(empty.src.slide()).toBeNull();
    const { src, store } = await source([]);
    const missing = createPhotoSource({
      blobs: store,
      objectUrls: urls,
      keys: () => ['gone'],
      doc: document,
    });
    missing.prime();
    await flush();
    expect(missing.slide()).toBeNull();
    store.get = () => Promise.reject(new Error('idb lost'));
    const failing = createPhotoSource({
      blobs: store,
      objectUrls: urls,
      keys: () => ['x'],
      doc: document,
    });
    failing.prime();
    await flush();
    expect(failing.slide()).toBeNull();
    expect(src).toBeDefined();
  });

  it('a load that finishes after reset() is dropped and leaks nothing', async () => {
    const { src } = await source(['a']);
    src.prime();
    src.reset();
    await flush();
    expect(objectUrls.live).toEqual([]);
  });

  it('reset() revokes a prepared, unused photo', async () => {
    const { src } = await source(['a']);
    src.prime();
    await flush();
    expect(objectUrls.live).toHaveLength(1);
    src.reset();
    expect(objectUrls.live).toEqual([]);
  });

  it('re-preparing replaces (and revokes) an older prepared photo', async () => {
    const { src, setKeys } = await source(['a', 'b']);
    src.prime();
    await flush();
    setKeys(['b']);
    expect(src.slide()).toBeNull(); // prepared 'a' no longer matches; loads 'b'
    await flush();
    expect(objectUrls.live).toHaveLength(1);
    src.reset();
  });

  it('priming twice does not load twice; a failing read after reset is ignored', async () => {
    const { src, store } = await source(['a']);
    src.prime();
    await flush();
    src.prime();
    src.prime();
    await flush();
    expect(objectUrls.created).toHaveLength(1);
    src.reset();
    store.get = () => Promise.reject(new Error('lost'));
    src.prime();
    src.reset();
    await flush();
    expect(objectUrls.live).toEqual([]);
  });
});
