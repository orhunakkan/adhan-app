import type { KeyValueStore } from '../../src/core/ports';

export class MemoryStore implements KeyValueStore {
  private readonly map: Map<string, string>;

  constructor(initial: Record<string, string> = {}) {
    this.map = new Map(Object.entries(initial));
  }

  get(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.map.set(key, value);
  }

  remove(key: string): void {
    this.map.delete(key);
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.map);
  }
}
