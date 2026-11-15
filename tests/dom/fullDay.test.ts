import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import { PRAYERS, computeDay } from '../../src/core/prayerTimes';
import { gradientFor } from '../../src/ui/background';
import { SCHAUMBURG } from '../helpers/days';
import { mountApp, type Mounted } from '../helpers/mountApp';

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
const q = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const calc = { ...defaultSettings.calc, method: 'NorthAmerica' as const };
const t = computeDay('2026-05-10', SCHAUMBURG, calc);
const NEXT = {
  fajr: 'Güneş',
  sunrise: 'Öğle',
  dhuhr: 'İkindi',
  asr: 'Akşam',
  maghrib: 'Yatsı',
  isha: 'İmsak',
} as const;
const visibleLayer = () => q('.sky__layer--visible');

describe('full-day simulation in Schaumburg (00:00 → 23:59)', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('updates the period, chips, next-prayer card, sky and azan moment at every prayer', async () => {
    m = mountApp({ start: new Date('2026-05-10T05:00:00Z') }); // 00:00 CDT
    await m.app.tapStart();
    expect(document.documentElement.dataset.period).toBe('isha');
    expect(q('.next-card__name').textContent).toBe('İmsak');
    for (const p of PRAYERS) {
      await m.clock.advanceToAsync(new Date(t[p].getTime() + 1000));
      await flush();
      expect(document.documentElement.dataset.period, p).toBe(p);
      expect(q(`.chip[data-prayer="${p}"]`).classList.contains('chip--current'), p).toBe(true);
      expect(q('.next-card__name').textContent, p).toBe(NEXT[p]);
      expect(visibleLayer().style.backgroundImage).toBe(gradientFor('midnight', p));
      expect(document.querySelectorAll('.sky__layer--visible')).toHaveLength(1);
      if (p === 'sunrise') {
        expect(m.app.state().azan).toBeNull(); // sunrise never plays
      } else {
        expect(m.app.state().azan?.prayer, p).toBe(p);
        m.player!.finish();
        await flush();
        expect(m.app.state().azan, `${p} back to clock`).toBeNull();
      }
    }
    await m.clock.advanceToAsync(new Date('2026-05-11T04:59:00Z')); // 23:59
    expect(document.documentElement.dataset.period).toBe('isha');
    expect(q('.chip[data-prayer="fajr"]').classList.contains('chip--next')).toBe(true);
  });
});

describe('themes and pattern', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('switching theme sets data-theme, the CSS variables and the sky gradient', () => {
    m = mountApp({ start: new Date(t.asr.getTime() + 60_000) });
    expect(visibleLayer().style.backgroundImage).toBe(gradientFor('midnight', 'asr'));
    m.app.updateSettings({ display: { ...m.app.state().settings.display, theme: 'emerald' } });
    expect(document.documentElement.dataset.theme).toBe('emerald');
    expect(document.documentElement.style.getPropertyValue('--text-1')).toBe('#F3EBD8');
    expect(visibleLayer().style.backgroundImage).toBe(gradientFor('emerald', 'asr'));
  });

  it('toggles the geometric pattern', () => {
    m = mountApp({ start: t.asr });
    expect(q('.sky__pattern').classList.contains('sky__pattern--on')).toBe(true);
    m.app.updateSettings({ display: { ...m.app.state().settings.display, pattern: false } });
    expect(q('.sky__pattern').classList.contains('sky__pattern--on')).toBe(false);
  });

  it('uses the night sky before a location is set', () => {
    m = mountApp({ start: t.asr, location: null });
    expect(document.documentElement.dataset.period).toBe('isha');
  });
});
