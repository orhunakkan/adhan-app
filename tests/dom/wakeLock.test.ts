import { afterEach, describe, expect, it } from 'vitest';
import { FakeWakeLock } from '../helpers/fakeWakeLock';
import { mountApp, type Mounted } from '../helpers/mountApp';

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const START = new Date('2026-05-10T17:00:00Z');
const hint = () => document.querySelector('.toast-region')?.textContent ?? '';

describe('wake lock (progressive enhancement)', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('unsupported (iPadOS 15): no errors, the Auto-Lock hint shows once, never after a reload', async () => {
    m = mountApp({ start: START });
    await m.app.tapStart();
    await flush();
    expect(m.app.state().wakeLock).toBe('unsupported');
    expect(hint()).toMatch(/Otomatik Kilit/);
    const store = m.store;
    const clock = m.clock;
    m.app.dispose();
    m.root.remove();
    m = mountApp({ store, clock, start: START });
    await m.app.tapStart();
    await flush();
    expect(hint()).toBe('');
    m.dispose();
    clock.dispose();
    m = undefined;
  });

  it('supported: requested after Start and re-requested when visible again', async () => {
    const wakeLock = new FakeWakeLock({ supported: true });
    m = mountApp({ start: START, wakeLock });
    expect(wakeLock.requests).toBe(0);
    await m.app.tapStart();
    await flush();
    expect(m.app.state().wakeLock).toBe('held');
    wakeLock.releaseAll();
    expect(m.app.state().wakeLock).toBe('released');
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(wakeLock.requests).toBe(2);
    expect(m.app.state().wakeLock).toBe('held');
    expect(hint()).toBe('');
  });

  it('rejected: shows the hint', async () => {
    m = mountApp({ start: START, wakeLock: new FakeWakeLock({ supported: true, reject: true }) });
    await m.app.tapStart();
    await flush();
    expect(m.app.state().wakeLock).toBe('denied');
    expect(hint()).not.toBe('');
    expect(m.app.log.entries().some((e) => /wake lock/.test(e.msg))).toBe(true);
  });

  it('does not re-request before the Start tap, or while held', async () => {
    const wakeLock = new FakeWakeLock({ supported: true });
    m = mountApp({ start: START, wakeLock });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(wakeLock.requests).toBe(0);
    await m.app.tapStart();
    await m.app.tapStart();
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(wakeLock.requests).toBe(1);
  });
});
