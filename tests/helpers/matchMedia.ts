import { vi } from 'vitest';

const matches = new Map<string, boolean>();
const listeners = new Map<string, Set<(e: { matches: boolean }) => void>>();

/** Sets a media query result (e.g. '(prefers-reduced-motion: reduce)') and notifies listeners. */
export function setMediaQuery(query: string, value: boolean): void {
  matches.set(query, value);
  for (const fn of listeners.get(query) ?? []) fn({ matches: value });
}

export function stubMatchMedia(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return matches.get(query) ?? false;
    },
    media: query,
    addEventListener(_type: string, fn: (e: { matches: boolean }) => void) {
      let set = listeners.get(query);
      if (!set) listeners.set(query, (set = new Set()));
      set.add(fn);
    },
    removeEventListener(_type: string, fn: (e: { matches: boolean }) => void) {
      listeners.get(query)?.delete(fn);
    },
    // Safari 15 still ships the legacy API too; adapters may use either.
    addListener(fn: (e: { matches: boolean }) => void) {
      this.addEventListener('change', fn);
    },
    removeListener(fn: (e: { matches: boolean }) => void) {
      this.removeEventListener('change', fn);
    },
  }));
}

export function resetMediaQueries(): void {
  matches.clear();
  listeners.clear();
}
