import { describe, expect, it } from 'vitest';
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
