// Minimal observable store: one state object, shallow-merge updates, listeners.

export interface Store<S> {
  get(): S;
  update(patch: Partial<S>): void;
  subscribe(fn: (state: S) => void): () => void;
}

/**
 * `onListenerError` receives a listener's exception: one broken view must never
 * abort the caller of update() (e.g. the code that closes an azan moment).
 */
export function createStore<S extends object>(
  initial: S,
  onListenerError: (error: unknown) => void = () => {},
): Store<S> {
  let state = initial;
  const listeners = new Set<(state: S) => void>();
  return {
    get: () => state,
    update(patch) {
      state = { ...state, ...patch };
      for (const fn of [...listeners]) {
        try {
          fn(state);
        } catch (e) {
          onListenerError(e);
        }
      }
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
