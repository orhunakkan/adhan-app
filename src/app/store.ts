// Minimal observable store: one state object, shallow-merge updates, listeners.

export interface Store<S> {
  get(): S;
  update(patch: Partial<S>): void;
  subscribe(fn: (state: S) => void): () => void;
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<(state: S) => void>();
  return {
    get: () => state,
    update(patch) {
      state = { ...state, ...patch };
      for (const fn of [...listeners]) fn(state);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
