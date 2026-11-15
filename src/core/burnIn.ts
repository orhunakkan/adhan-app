// Burn-in mitigation (brief §8.6, §9): a ±8 px layout shift that changes every
// 10 minutes. With no screensaver (ADR-0007), this and night dim are the care.
import type { Rng } from './ports';

export const BURN_IN_INTERVAL_MS = 10 * 60_000;
export const BURN_IN_MAX_PX = 8;

export interface Offset {
  x: number;
  y: number;
}

/** Offsets come from the injected RNG once per 10-minute bucket. */
export function createBurnInShift(rng: Rng, maxPx = BURN_IN_MAX_PX) {
  let bucket = Number.NaN;
  let current: Offset = { x: 0, y: 0 };
  const draw = () => Math.floor(rng.next() * (2 * maxPx + 1)) - maxPx;
  return {
    offsetAt(now: Date): Offset {
      const b = Math.floor(now.getTime() / BURN_IN_INTERVAL_MS);
      if (b !== bucket) {
        bucket = b;
        current = { x: draw(), y: draw() };
      }
      return current;
    },
  };
}
