import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../../src/app/store';

describe('createStore', () => {
  it('notifies listeners with the merged state and supports unsubscribe', () => {
    const s = createStore({ a: 1, b: 2 });
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.update({ a: 5 });
    off();
    s.update({ b: 9 });
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith({ a: 5, b: 2 });
    expect(s.get()).toEqual({ a: 5, b: 9 });
  });

  it('isolates a throwing listener: others still run and update() does not throw', () => {
    const onError = vi.fn();
    const s = createStore({ n: 0 }, onError);
    const after = vi.fn();
    s.subscribe(() => {
      throw new Error('broken view');
    });
    s.subscribe(after);
    expect(() => s.update({ n: 1 })).not.toThrow();
    expect(after).toHaveBeenCalledWith({ n: 1 });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'broken view' }));
  });

  it('swallows listener errors by default', () => {
    const s = createStore({ n: 0 });
    s.subscribe(() => {
      throw new Error('x');
    });
    expect(() => s.update({ n: 1 })).not.toThrow();
  });
});
