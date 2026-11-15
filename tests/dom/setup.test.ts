import { describe, expect, it } from 'vitest';
import { setMediaQuery } from '../helpers/matchMedia';
import { objectUrls } from '../helpers/objectUrls';

describe('dom setup', () => {
  it('provides IndexedDB via fake-indexeddb', () => {
    expect(typeof indexedDB.open).toBe('function');
  });

  it('stubs media play() to resolve', async () => {
    await expect(document.createElement('audio').play()).resolves.toBeUndefined();
  });

  it('tracks object URLs', () => {
    const url = URL.createObjectURL(new Blob(['x']));
    URL.revokeObjectURL(url);
    expect(objectUrls.created).toEqual([url]);
    expect(objectUrls.live).toEqual([]);
  });

  it('makes matchMedia controllable', () => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    let seen = false;
    mq.addEventListener('change', (e) => (seen = e.matches));
    setMediaQuery('(prefers-reduced-motion: reduce)', true);
    expect(mq.matches).toBe(true);
    expect(seen).toBe(true);
  });

  it('has no Wake Lock API by default, like iPadOS 15', () => {
    expect((navigator as { wakeLock?: unknown }).wakeLock).toBeUndefined();
  });
});
