import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import { computeDay } from '../../src/core/prayerTimes';
import { LONG_PRESS_MS } from '../../src/ui/settings/shell';
import { SCHAUMBURG } from '../helpers/days';
import { mountApp, type Mounted } from '../helpers/mountApp';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const qa = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const calc = { ...defaultSettings.calc, method: 'NorthAmerica' as const };
const t = computeDay('2026-05-10', SCHAUMBURG, calc);
const INTERVAL = 60_000; // default panelIntervalSec
// Quiet time well away from any prayer, aligned to the start of a 3-interval cycle.
const QUIET = new Date(
  Math.ceil((t.dhuhr.getTime() + 30 * 60_000) / (3 * INTERVAL)) * 3 * INTERVAL,
);

describe('panels screensaver', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('shows a panel every third interval, Arabic above the translation, with its source', async () => {
    m = mountApp({ start: QUIET });
    await flush();
    expect(q('.screensaver')!.classList.contains('screensaver--active')).toBe(false);
    m.clock.advanceBy(2 * INTERVAL);
    expect(q('.screensaver')!.classList.contains('screensaver--active')).toBe(true);
    const panel = q('.panel')!;
    const children = [...panel.children].map((c) => c.className);
    expect(children[0]).toMatch(/panel__text--ar/);
    expect(children[1]).toBe('panel__translation');
    expect(q('.panel__text')!.getAttribute('dir')).toBe('rtl');
    expect(q('.panel__source')!.textContent).toMatch(/Pickthall/);
    m.clock.advanceBy(INTERVAL);
    expect(q('.screensaver')!.classList.contains('screensaver--active')).toBe(false);
  });

  it('rotates to a different panel each cycle and never keeps more than 2 slide nodes', async () => {
    m = mountApp({ start: QUIET });
    await flush();
    const seen = new Set<string>();
    for (let cycle = 0; cycle < 12; cycle++) {
      m.clock.advanceBy(2 * INTERVAL);
      seen.add(q('.slide--in')!.dataset.panel!);
      expect(qa('.slide').length).toBeLessThanOrEqual(2);
      m.clock.advanceBy(INTERVAL);
      expect(qa('.slide').length).toBeLessThanOrEqual(2);
    }
    expect(seen.size).toBeGreaterThanOrEqual(10);
  });

  it('shows the clock pill with the next prayer, rotating corners for burn-in', async () => {
    m = mountApp({ start: QUIET });
    await flush();
    m.clock.advanceBy(2 * INTERVAL);
    expect(q('.pill__next')!.textContent).toMatch(/^İkindi · \d/);
    const corners = new Set<string>();
    for (let i = 0; i < 4; i++) {
      corners.add([...q('.pill')!.classList].find((c) => c.startsWith('pill--'))!);
      m.clock.advanceBy(10 * 60_000);
    }
    expect(corners.size).toBeGreaterThanOrEqual(2);
  });

  it('keeps the clock near a prayer and while settings are open', async () => {
    m = mountApp({ start: new Date(t.asr.getTime() - 9 * 60_000) });
    await flush();
    for (let i = 0; i < 6; i++) {
      m.clock.advanceBy(INTERVAL);
      expect(q('.screensaver')!.classList.contains('screensaver--active')).toBe(false);
    }
    m.dispose();
    m = mountApp({ start: QUIET });
    await flush();
    q('.settings-hotspot')!.dispatchEvent(new Event('pointerdown'));
    m.clock.advanceBy(LONG_PRESS_MS);
    // Into the slide slot while the sheet is still open (it auto-closes after 2 min idle).
    m.clock.advanceBy(2 * INTERVAL - LONG_PRESS_MS + 1000);
    expect(q('.screensaver')!.classList.contains('screensaver--active')).toBe(false);
  });

  it('stays on the clock if panels fail to load', async () => {
    m = mountApp({ start: QUIET, loadPanels: () => Promise.reject(new Error('offline')) });
    await flush();
    m.clock.advanceBy(2 * INTERVAL);
    expect(q('.slide')).toBeNull();
    expect(m.app.log.entries().some((e) => e.msg === 'panels could not load')).toBe(true);
  });
});

describe('renderPanel', () => {
  it('renders a Latin-script panel without translation or source', async () => {
    const { renderPanel } = await import('../../src/ui/panels');
    const el = renderPanel({ id: 'x', lang: 'tr', text: 'Sabır' });
    expect(el.querySelector('.panel__text')!.getAttribute('dir')).toBe('ltr');
    expect(el.querySelector('.panel__translation')).toBeNull();
    expect(el.querySelector('.panel__source')).toBeNull();
  });
});
