import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import { computeDay } from '../../src/core/prayerTimes';
import { RING_CIRCUMFERENCE } from '../../src/ui/progressRing';
import { formatCountdown } from '../../src/ui/nextPrayerCard';
import { SCHAUMBURG } from '../helpers/days';
import { mountApp, type Mounted } from '../helpers/mountApp';

const q = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const calc = { ...defaultSettings.calc, method: 'NorthAmerica' as const };
const t = computeDay('2026-05-10', SCHAUMBURG, calc);
const tomorrow = computeDay('2026-05-11', SCHAUMBURG, calc);
const chip = (p: string) => q(`.chip[data-prayer="${p}"]`);
const stateOf = (p: string) =>
  ['past', 'current', 'next', 'upcoming'].find((k) => chip(p).classList.contains(`chip--${k}`));

describe('formatCountdown', () => {
  it.each([
    [0, '00:00'],
    [59_999, '00:59'],
    [61_000, '01:01'],
    [3_723_000, '1:02:03'],
    [-5, '00:00'],
  ])('%s ms → %s', (ms, out) => {
    expect(formatCountdown(ms, 'en')).toBe(out);
  });

  it('uses Arabic-Indic digits for Arabic', () => {
    expect(formatCountdown(3_723_000, 'ar-u-nu-arab')).toBe('١:٠٢:٠٣');
  });
});

describe('next-prayer card and timeline', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('shows the next prayer, its time, the countdown and ring progress', () => {
    const mid = new Date((t.dhuhr.getTime() + t.asr.getTime()) / 2);
    m = mountApp({ start: mid });
    expect(q('.next-card__label').textContent).toBe('Sıradaki vakit');
    expect(q('.next-card__name').textContent).toBe('İkindi');
    expect(q('.next-card__time').textContent).toBe(
      new Intl.DateTimeFormat('tr', {
        timeZone: SCHAUMBURG.tz,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(t.asr),
    );
    expect(q('.next-card__countdown').getAttribute('role')).toBe('timer');
    const offset = Number(q('.ring__bar').getAttribute('stroke-dashoffset'));
    expect(offset).toBeCloseTo(RING_CIRCUMFERENCE / 2, 0);
    const before = q('.next-card__countdown').textContent;
    m.clock.advanceBy(1000);
    expect(q('.next-card__countdown').textContent).not.toBe(before);
  });

  it('marks past, current, next and upcoming chips with icons and names', () => {
    m = mountApp({ start: new Date(t.asr.getTime() + 60_000) });
    expect(stateOf('fajr')).toBe('past');
    expect(stateOf('dhuhr')).toBe('past');
    expect(stateOf('asr')).toBe('current');
    expect(chip('asr').getAttribute('aria-current')).toBe('time');
    expect(stateOf('maghrib')).toBe('next');
    expect(stateOf('isha')).toBe('upcoming');
    expect(chip('asr').querySelector('svg.icon')).not.toBeNull();
    expect(chip('maghrib').querySelector('.chip__name')!.textContent).toBe('Akşam');
  });

  it("after Isha, Fajr is next and shows tomorrow's time", () => {
    m = mountApp({ start: new Date(t.isha.getTime() + 60_000) });
    expect(stateOf('isha')).toBe('current');
    expect(stateOf('fajr')).toBe('next');
    const fmt = new Intl.DateTimeFormat('tr', {
      timeZone: SCHAUMBURG.tz,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    expect(chip('fajr').querySelector('.chip__time')!.textContent).toBe(fmt.format(tomorrow.fajr));
  });

  it('hides the card and timeline without a location', () => {
    m = mountApp({ start: t.asr, location: null });
    expect(q('.next-card').hidden).toBe(true);
    expect(q('.timeline').hidden).toBe(true);
  });

  it('shows the pre-alert pill N minutes before a prayer and hides it at the prayer', () => {
    m = mountApp({ start: new Date(t.maghrib.getTime() - 11 * 60_000) });
    expect(q('.prealert').hidden).toBe(true);
    m.clock.advanceBy(60_000);
    expect(q('.prealert').hidden).toBe(false);
    expect(q('.prealert').textContent).toBe('Akşam vaktine 10 dk');
    expect(q('.prealert').getAttribute('aria-live')).toBe('polite');
    m.clock.advanceBy(5 * 60_000);
    expect(q('.prealert').textContent).toBe('Akşam vaktine 5 dk');
    m.clock.advanceTo(new Date(t.maghrib.getTime() + 1000));
    expect(q('.prealert').hidden).toBe(true);
    expect(m.app.state().preAlert).toBeNull();
  });
});
