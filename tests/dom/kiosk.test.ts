import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import { computeDay } from '../../src/core/prayerTimes';
import { SCHAUMBURG } from '../helpers/days';
import { setMediaQuery } from '../helpers/matchMedia';
import { mountApp, type Mounted } from '../helpers/mountApp';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const q = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const calc = { ...defaultSettings.calc, method: 'NorthAmerica' as const };
const t = computeDay('2026-05-10', SCHAUMBURG, calc);
const t11 = computeDay('2026-05-11', SCHAUMBURG, calc);

describe('burn-in shift', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('moves the layout within ±8 px, changing only every 10 minutes', () => {
    m = mountApp({ start: new Date('2026-05-10T17:00:00Z') });
    const transforms: string[] = [];
    for (let minute = 0; minute < 60; minute++) {
      m.clock.advanceBy(60_000);
      transforms.push(q('.layout').style.transform);
    }
    for (const tr of transforms) {
      const [x, y] = /translate\((-?\d+)px, (-?\d+)px\)/.exec(tr)!.slice(1).map(Number);
      expect(Math.abs(x!)).toBeLessThanOrEqual(8);
      expect(Math.abs(y!)).toBeLessThanOrEqual(8);
    }
    const changes = transforms.filter((tr, i) => i > 0 && tr !== transforms[i - 1]).length;
    expect(changes).toBeGreaterThanOrEqual(3);
    expect(changes).toBeLessThanOrEqual(6);
  });
});

describe('night dim', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('is on at 01:00, off at Fajr − 1 min, and lifted during an azan', async () => {
    m = mountApp({ start: new Date('2026-05-11T06:00:00Z') }); // 01:00 CDT
    expect(q('.night-dim').classList.contains('night-dim--active')).toBe(true);
    expect(q('.night-dim').style.opacity).toBe('0.7');
    expect(q('.screensaver').classList.contains('screensaver--active')).toBe(false);
    m.clock.advanceTo(new Date(t11.fajr.getTime() - 60_000));
    expect(q('.night-dim').classList.contains('night-dim--active')).toBe(false);
    m.dispose();

    // Y = 0: still dark until the azan lifts it.
    m = mountApp({
      start: new Date(t11.fajr.getTime() - 5 * 60_000),
      settings: {
        display: {
          ...defaultSettings.display,
          nightDim: { ...defaultSettings.display.nightDim, beforeFajrMin: 0 },
        },
      },
    });
    await m.app.tapStart();
    expect(q('.night-dim').classList.contains('night-dim--active')).toBe(true);
    await m.clock.advanceToAsync(new Date(t11.fajr.getTime() + 1000));
    await flush();
    expect(m.app.state().azan?.prayer).toBe('fajr');
    expect(q('.night-dim').classList.contains('night-dim--active')).toBe(false);
  });

  it('is off in the daytime and when disabled', () => {
    m = mountApp({ start: t.asr });
    expect(q('.night-dim').classList.contains('night-dim--active')).toBe(false);
    m.dispose();
    m = mountApp({
      start: new Date('2026-05-11T06:00:00Z'),
      settings: {
        display: {
          ...defaultSettings.display,
          nightDim: { ...defaultSettings.display.nightDim, enabled: false },
        },
      },
    });
    expect(q('.night-dim').classList.contains('night-dim--active')).toBe(false);
  });
});

describe('reduced motion', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('applies the reduced-motion class and drops the breathing glow and Ken Burns', async () => {
    setMediaQuery('(prefers-reduced-motion: reduce)', true);
    m = mountApp({ start: new Date(t.maghrib.getTime() - 60_000) });
    expect(document.documentElement.classList.contains('reduced-motion')).toBe(true);
    await m.app.tapStart();
    await m.clock.advanceToAsync(new Date(t.maghrib.getTime() + 1000));
    await flush();
    expect(q('.azan__glow').classList.contains('azan__glow--breathing')).toBe(false);
    expect(document.querySelector('.photo--kenburns')).toBeNull();
  });

  it('follows the media query when it changes', () => {
    m = mountApp({ start: t.asr });
    expect(document.documentElement.classList.contains('reduced-motion')).toBe(false);
    expect(q('.azan__glow').classList.contains('azan__glow--breathing')).toBe(true);
    setMediaQuery('(prefers-reduced-motion: reduce)', true);
    expect(document.documentElement.classList.contains('reduced-motion')).toBe(true);
    expect(q('.azan__glow').classList.contains('azan__glow--breathing')).toBe(false);
  });
});
