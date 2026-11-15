import type { BlobStore } from '../../src/core/ports';

export class MemoryBlobStore implements BlobStore {
  private readonly map = new Map<string, Blob>();

  get(key: string): Promise<Blob | undefined> {
    return Promise.resolve(this.map.get(key));
  }

  set(key: string, value: Blob): Promise<void> {
    this.map.set(key, value);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }

  keys(): Promise<string[]> {
    return Promise.resolve([...this.map.keys()]);
  }
}
