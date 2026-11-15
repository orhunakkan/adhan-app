import { createStore, type UseStore } from 'idb-keyval';
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { createIdbBlobStore } from '../../src/adapters/idbBlobStore';
import { createLocalStore } from '../../src/adapters/localStore';

describe('createLocalStore', () => {
  it('reads and writes localStorage', () => {
    const s = createLocalStore();
    s.set('k', 'v');
    expect(localStorage.getItem('k')).toBe('v');
    expect(s.get('k')).toBe('v');
    s.remove('k');
    expect(s.get('k')).toBeNull();
  });

  it('swallows storage exceptions (Safari private mode, quota)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    } as unknown as Storage;
    const s = createLocalStore(throwing);
    expect(s.get('k')).toBeNull();
    expect(() => s.set('k', 'v')).not.toThrow();
    expect(() => s.remove('k')).not.toThrow();
  });

  it('survives window.localStorage itself throwing (Safari SecurityError)', () => {
    const spy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    try {
      const s = createLocalStore();
      expect(s.get('k')).toBeNull();
      expect(() => s.set('k', 'v')).not.toThrow();
      expect(() => s.remove('k')).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('createIdbBlobStore (fake-indexeddb)', () => {
  it('stores, lists and deletes blobs', async () => {
    const s = createIdbBlobStore('test-db', 'blobs');
    await s.set('audio-1', new Blob(['abcd'], { type: 'audio/mp4' }));
    expect(await s.keys()).toEqual(['audio-1']);
    const blob = await s.get('audio-1');
    expect(blob).toBeDefined();
    await s.delete('audio-1');
    expect(await s.get('audio-1')).toBeUndefined();
    expect(await s.keys()).toEqual([]);
  });
});

describe('createIdbBlobStore reconnect', () => {
  it('reopens the database and retries once when a connection has gone bad', async () => {
    let opens = 0;
    const open = (db: string, store: string): UseStore => {
      opens += 1;
      if (opens === 1) {
        // A connection Safari closed silently: every transaction fails.
        return () => Promise.reject(new DOMException('connection is closing', 'InvalidStateError'));
      }
      return createStore(db, store);
    };
    const s = createIdbBlobStore('reconnect-db', 'blobs', open);
    await s.set('photo-1', new Blob(['x'], { type: 'image/jpeg' }));
    expect(opens).toBe(2);
    expect(await s.keys()).toEqual(['photo-1']);
    expect(opens).toBe(2); // the healthy connection is kept
  });

  it('gives up after one retry so the caller sees the error', async () => {
    const failing = (): UseStore => () => Promise.reject(new Error('IndexedDB unavailable'));
    const s = createIdbBlobStore('x', 'y', failing);
    await expect(s.get('k')).rejects.toThrow('IndexedDB unavailable');
  });
});
