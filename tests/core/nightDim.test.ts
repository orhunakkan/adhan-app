import { describe, expect, it } from 'vitest';
import { nightDimState, type NightDimSettings } from '../../src/core/nightDim';
import { daysAround, MIN, plus, SEC } from '../helpers/days';

const days = daysAround('2026-05-10');
const { yesterday, today } = days;
const settings: NightDimSettings = {
  enabled: true,
  afterIshaMin: 60,
  beforeFajrMin: 30,
  opacity: 0.7,
};
const dim = (now: Date, over: Partial<NightDimSettings> = {}, azanActive = false) =>
  nightDimState({ now, days, settings: { ...settings, ...over }, azanActive });

describe('nightDimState', () => {
  it.each([
    ['just before Isha + 60 min', plus(today.isha, 60 * MIN - SEC), false],
    ['at Isha + 60 min', plus(today.isha, 60 * MIN), true],
    ["at 01:00 (after midnight, from yesterday's Isha)", plus(today.fajr, -2 * 60 * MIN), true],
    ['just before Fajr − 30 min', plus(today.fajr, -30 * MIN - SEC), true],
    ['at Fajr − 30 min', plus(today.fajr, -30 * MIN), false],
    ['midday', today.dhuhr, false],
  ])('%s → active=%s', (_l, now, active) => {
    expect(dim(now).active).toBe(active);
  });

  it('reports the configured opacity while active and 0 otherwise', () => {
    expect(dim(plus(today.fajr, -2 * 60 * MIN))).toEqual({ active: true, opacity: 0.7 });
    expect(dim(today.dhuhr)).toEqual({ active: false, opacity: 0 });
  });

  it('lifts 1 minute before an azan even if the window would still be on (Y = 0)', () => {
    const over = { beforeFajrMin: 0 };
    expect(dim(plus(today.fajr, -MIN - SEC), over).active).toBe(true);
    expect(dim(plus(today.fajr, -MIN), over).active).toBe(false);
  });

  it('lifts while an azan is playing', () => {
    expect(dim(plus(today.fajr, -2 * 60 * MIN), {}, true).active).toBe(false);
  });

  it('honours custom X/Y values', () => {
    const over = { afterIshaMin: 0, beforeFajrMin: 90 };
    expect(dim(plus(yesterday.isha, SEC), over).active).toBe(true);
    expect(dim(plus(today.fajr, -90 * MIN), over).active).toBe(false);
  });

  it('is never active when disabled', () => {
    expect(dim(plus(today.fajr, -2 * 60 * MIN), { enabled: false }).active).toBe(false);
  });
});
