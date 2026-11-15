import { describe, expect, it } from 'vitest';
import { AZAN_PRAYERS } from '../../src/core/prayerTimes';
import { canApplyUpdate } from '../../src/core/updateGate';
import { daysAround, MIN, plus, SEC } from '../helpers/days';

const days = daysAround('2026-05-10');
const { today } = days;
const gate = (now: Date, azanPlaying = false) => canApplyUpdate({ now, days, azanPlaying });

describe('canApplyUpdate', () => {
  describe.each(AZAN_PRAYERS)('around %s', (p) => {
    it.each([
      ['5 min before', -5 * MIN, false],
      ['5 min 1 s before', -5 * MIN - SEC, true],
      ['1 min before', -MIN, false],
      ['at the prayer', 0, false],
      ['within the 2 min late window', 2 * MIN, false],
      ['just after the late window', 2 * MIN + SEC, true],
    ])('%s → allowed=%s', (_label, offset, allowed) => {
      expect(gate(plus(today[p], offset)).allowed).toBe(allowed);
    });
  });

  it('ignores sunrise, which has no azan', () => {
    expect(gate(plus(today.sunrise, -MIN))).toEqual({ allowed: true });
  });

  it('blocks whenever an azan is playing, with a reason', () => {
    expect(gate(plus(today.dhuhr, 30 * MIN), true)).toEqual({
      allowed: false,
      reason: 'azan-playing',
    });
  });

  it('says when the block lifts for an upcoming prayer', () => {
    expect(gate(plus(today.asr, -MIN))).toEqual({
      allowed: false,
      reason: 'prayer-soon',
      until: plus(today.asr, 2 * MIN),
    });
  });

  it("considers tomorrow's fajr late in the evening", () => {
    expect(gate(plus(days.tomorrow.fajr, -2 * MIN)).allowed).toBe(false);
  });
});
