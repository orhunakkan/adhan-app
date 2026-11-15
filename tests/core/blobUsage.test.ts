import { describe, expect, it } from 'vitest';
import { blobBytes, formatBytes } from '../../src/core/blobUsage';
import { MemoryBlobStore } from '../helpers/memoryBlobStore';

describe('blob storage usage', () => {
  it('sums every stored blob', async () => {
    const s = new MemoryBlobStore();
    await s.set('a', new Blob(['12345']));
    await s.set('b', new Blob(['123']));
    expect(await blobBytes(s)).toBe(8);
    expect(await blobBytes(new MemoryBlobStore())).toBe(0);
  });

  it('counts a key whose blob vanished between keys() and get() as 0', async () => {
    const s = new MemoryBlobStore();
    await s.set('a', new Blob(['12']));
    s.get = () => Promise.resolve(undefined);
    expect(await blobBytes(s)).toBe(0);
  });

  it.each([
    [0, '0 B'],
    [1023, '1,023 B'],
    [1536, '1.5 KB'],
    [5 * 1024 * 1024, '5 MB'],
    [3 * 1024 ** 4, '3,072 GB'],
  ])('%s bytes → %s', (n, s) => {
    expect(formatBytes(n, 'en')).toBe(s);
  });
});
