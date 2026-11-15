import { vi } from 'vitest';
import type { Clock, TimerHandle } from '../../src/core/ports';

/**
 * Clock port backed by Vitest fake timers. Creating one installs fake timers
 * (setInterval, setTimeout and Date); call dispose() in afterEach.
 */
export class FakeClock implements Clock {
  constructor(start: Date) {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'],
    });
    vi.setSystemTime(start);
  }

  now(): Date {
    return new Date(Date.now());
  }

  setInterval(fn: () => void, ms: number): TimerHandle {
    return globalThis.setInterval(fn, ms);
  }

  clearInterval(handle: TimerHandle): void {
    globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>);
  }

  setTimeout(fn: () => void, ms: number): TimerHandle {
    return globalThis.setTimeout(fn, ms);
  }

  clearTimeout(handle: TimerHandle): void {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
  }

  /** Advances time, running every timer that falls due on the way. */
  advanceBy(ms: number): void {
    vi.advanceTimersByTime(ms);
  }

  advanceTo(date: Date): void {
    const delta = date.getTime() - Date.now();
    if (delta < 0) throw new Error('FakeClock cannot move backwards');
    vi.advanceTimersByTime(delta);
  }

  /** Same as advanceBy, but lets pending promise callbacks run between timers. */
  async advanceByAsync(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
  }

  async advanceToAsync(date: Date): Promise<void> {
    const delta = date.getTime() - Date.now();
    if (delta < 0) throw new Error('FakeClock cannot move backwards');
    await vi.advanceTimersByTimeAsync(delta);
  }

  dispose(): void {
    vi.useRealTimers();
  }
}
