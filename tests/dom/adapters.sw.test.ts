import { describe, expect, it, vi } from 'vitest';

const listeners = new Map<string, () => void>();
const register = vi.fn(() => Promise.resolve());
const messageSkipWaiting = vi.fn();
vi.mock('workbox-window', () => ({
  Workbox: class {
    addEventListener(type: string, fn: () => void) {
      listeners.set(type, fn);
    }
    register = register;
    messageSkipWaiting = messageSkipWaiting;
  },
}));

const { createServiceWorker } = await import('../../src/adapters/sw');

describe('createServiceWorker', () => {
  it('is undefined without service worker support', () => {
    expect(createServiceWorker({} as Navigator, location)).toBeUndefined();
  });

  it('registers, reports a waiting worker, and reloads once the new one controls', () => {
    const reload = vi.fn();
    const sw = createServiceWorker(
      { serviceWorker: {} } as unknown as Navigator,
      { reload } as unknown as Location,
    )!;
    const onWaiting = vi.fn();
    sw.register(onWaiting);
    expect(register).toHaveBeenCalled();
    listeners.get('waiting')!();
    expect(onWaiting).toHaveBeenCalled();
    sw.applyUpdate();
    expect(messageSkipWaiting).toHaveBeenCalled();
    listeners.get('controlling')!();
    expect(reload).toHaveBeenCalled();
  });
});
