import type { Clock, TimerHandle } from '../core/ports';

export const browserClock: Clock = {
  now: () => new Date(),
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (h: TimerHandle) => window.clearInterval(h as number),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (h: TimerHandle) => window.clearTimeout(h as number),
};
