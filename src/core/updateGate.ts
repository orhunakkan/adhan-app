// When a waiting service worker may be applied (brief §11). Applying reloads
// the page, which loses the audio unlock, so it is blocked near an azan. Pure.
import type { ThreeDays } from './period';
import { AZAN_PRAYERS } from './prayerTimes';

export const UPDATE_BLOCK_BEFORE_MS = 5 * 60_000;
/** Matches the scheduler's default late window: the azan may still start then. */
export const UPDATE_BLOCK_AFTER_MS = 2 * 60_000;

export type UpdateDecision =
  | { allowed: true }
  | { allowed: false; reason: 'azan-playing' }
  | { allowed: false; reason: 'prayer-soon'; until: Date };

export function canApplyUpdate(input: {
  now: Date;
  days: ThreeDays;
  azanPlaying: boolean;
}): UpdateDecision {
  if (input.azanPlaying) return { allowed: false, reason: 'azan-playing' };
  const t = input.now.getTime();
  for (const day of [input.days.yesterday, input.days.today, input.days.tomorrow]) {
    for (const p of AZAN_PRAYERS) {
      const at = day[p].getTime();
      if (t >= at - UPDATE_BLOCK_BEFORE_MS && t <= at + UPDATE_BLOCK_AFTER_MS) {
        return {
          allowed: false,
          reason: 'prayer-soon',
          until: new Date(at + UPDATE_BLOCK_AFTER_MS),
        };
      }
    }
  }
  return { allowed: true };
}
