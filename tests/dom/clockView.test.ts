import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import type { Settings } from '../../src/config/schema';
import { setMediaQuery } from '../helpers/matchMedia';
import { mountApp, type Mounted } from '../helpers/mountApp';

const START = new Date('2026-05-10T18:05:09Z'); // 13:05:09 CDT, Sunday
const q = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const display = (over: Partial<Settings['display']>) => ({
  display: { ...defaultSettings.display, ...over },
});

describe('clock view', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('shows 24-hour time, the Turkish Gregorian and Hijri dates and the location', () => {
    m = mountApp({ start: START });
    expect(q('.clock__hm').textContent).toBe('13:05');
    expect(q('.clock__sec').textContent).toBe('');
    expect(q('.clock__ampm').textContent).toBe('');
    expect(q('.clock__date').textContent).toBe('10 Mayıs 2026 Pazar');
    expect(q('.clock__hijri').textContent).toMatch(/^\d+ \S.* 1447$/);
    expect(q('.clock__location').textContent).toBe('Schaumburg, IL');
    expect(q('.clock__prompt').hidden).toBe(true);
  });

  it('shows seconds and 12-hour time when enabled', () => {
    m = mountApp({
      start: START,
      settings: display({ hour12: true, showSeconds: true, language: 'en' }),
    });
    expect(q('.clock__hm').textContent).toBe('1:05');
    expect(q('.clock__sec').textContent).toBe(':09');
    expect(q('.clock__ampm').textContent).toBe('PM');
    expect(q('.clock').classList.contains('clock--seconds')).toBe(true);
    expect(q('.clock__date').textContent).toBe('Sunday, May 10, 2026');
  });

  it('updates text only, keeping the same nodes every tick', () => {
    m = mountApp({ start: START, settings: display({ showSeconds: true }) });
    const hm = q('.clock__hm');
    const sec = q('.clock__sec');
    m.clock.advanceBy(60_000);
    expect(q('.clock__hm')).toBe(hm);
    expect(q('.clock__sec')).toBe(sec);
    expect(hm.textContent).toBe('13:06');
  });

  it('uses Arabic-Indic digits and the Arabic date in Arabic', () => {
    m = mountApp({ start: START, settings: display({ language: 'ar' }) });
    expect(q('.clock__hm').textContent).toBe('١٣:٠٥');
    expect(q('.clock__date').textContent).toMatch(/٢٠٢٦/);
  });

  it('asks for a location when none is set', () => {
    m = mountApp({ start: START, location: null });
    expect(q('.clock__location').textContent).toBe('Konum ayarlanmadı');
    expect(q('.clock__prompt').hidden).toBe(false);
    expect(q('.clock__prompt').textContent).toMatch(/konum/);
  });

  it('re-formats the dates when the day changes', () => {
    m = mountApp({ start: new Date('2026-05-11T04:59:30Z') }); // 23:59:30 CDT
    expect(q('.clock__date').textContent).toBe('10 Mayıs 2026 Pazar');
    m.clock.advanceBy(60_000);
    expect(q('.clock__date').textContent).toBe('11 Mayıs 2026 Pazartesi');
  });

  it('switches layout with the orientation media query', () => {
    m = mountApp({ start: START });
    const layout = q('.layout');
    expect(layout.classList.contains('layout--landscape')).toBe(true);
    setMediaQuery('(orientation: portrait)', true);
    expect(layout.classList.contains('layout--portrait')).toBe(true);
    expect(layout.classList.contains('layout--landscape')).toBe(false);
  });

  it('renders a stable landscape structure', async () => {
    m = mountApp({ start: START });
    await expect(q('.app-main').outerHTML).toMatchFileSnapshot(
      './__snapshots__/main.landscape.html',
    );
  });

  it('renders a stable portrait structure', async () => {
    setMediaQuery('(orientation: portrait)', true);
    m = mountApp({ start: START });
    await expect(q('.app-main').outerHTML).toMatchFileSnapshot(
      './__snapshots__/main.portrait.html',
    );
  });
});
