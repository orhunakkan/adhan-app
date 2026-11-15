import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserClock } from '../../src/adapters/clock';
import { mathRng } from '../../src/adapters/rng';

describe('browserClock', () => {
  afterEach(() => vi.useRealTimers());

  it('reads the system time and drives window timers', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T00:00:00Z'));
    expect(browserClock.now().toISOString()).toBe('2026-05-10T00:00:00.000Z');
    const tick = vi.fn();
    const once = vi.fn();
    const cancelled = vi.fn();
    const h = browserClock.setInterval(tick, 1000);
    browserClock.setTimeout(once, 500);
    const t = browserClock.setTimeout(cancelled, 500);
    browserClock.clearTimeout(t);
    vi.advanceTimersByTime(2000);
    browserClock.clearInterval(h);
    vi.advanceTimersByTime(2000);
    expect(tick).toHaveBeenCalledTimes(2);
    expect(once).toHaveBeenCalledOnce();
    expect(cancelled).not.toHaveBeenCalled();
  });
});

describe('mathRng', () => {
  it('returns numbers in [0, 1)', () => {
    for (let i = 0; i < 100; i++) {
      const v = mathRng.next();
      expect(v >= 0 && v < 1).toBe(true);
    }
  });
});
