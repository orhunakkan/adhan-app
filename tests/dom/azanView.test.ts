import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import { computeDay } from '../../src/core/prayerTimes';
import { SCHAUMBURG } from '../helpers/days';
import { mountApp, type Mounted } from '../helpers/mountApp';

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
const q = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const calc = { ...defaultSettings.calc, method: 'NorthAmerica' as const };
const t = computeDay('2026-05-10', SCHAUMBURG, calc);

async function atMaghrib(m: Mounted) {
  await m.app.tapStart();
  await m.clock.advanceToAsync(new Date(t.maghrib.getTime() + 1000));
  await flush();
}

describe('azan view', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('is hidden and inert until a prayer arrives', () => {
    m = mountApp({ start: new Date(t.maghrib.getTime() - 60_000) });
    expect(q('.azan').classList.contains('azan--visible')).toBe(false);
    expect(q('.azan').inert).toBe(true);
    expect(q('.azan').getAttribute('aria-hidden')).toBe('true');
  });

  it('takes over with the name in Turkish and Arabic, the time and a breathing glow', async () => {
    m = mountApp({ start: new Date(t.maghrib.getTime() - 60_000) });
    await atMaghrib(m);
    const v = q('.azan');
    expect(v.classList.contains('azan--visible')).toBe(true);
    expect(v.getAttribute('aria-live')).toBe('assertive');
    expect(q('.azan__name').textContent).toBe('Akşam');
    expect(q('.azan__arabic').textContent).toBe('المغرب');
    expect(q('.azan__time').textContent).toMatch(/^Vakit \d\d:\d\d$/);
    expect(q('.azan__glow').classList.contains('azan__glow--breathing')).toBe(true);
    expect(q('.azan__dua').hidden).toBe(true);
  });

  it('shows a single Arabic name when the UI is Arabic', async () => {
    m = mountApp({
      start: new Date(t.maghrib.getTime() - 60_000),
      settings: { display: { ...defaultSettings.display, language: 'ar' } },
    });
    await atMaghrib(m);
    expect(q('.azan__name').textContent).toBe('المغرب');
    expect(q('.azan__arabic').hidden).toBe(true);
  });

  it('tracks the audio position on the progress bar', async () => {
    m = mountApp({ start: new Date(t.maghrib.getTime() - 60_000) });
    await atMaghrib(m);
    m.player!.setPosition(45, 180);
    m.clock.advanceBy(1000);
    expect(q('.azan__progress').getAttribute('aria-valuenow')).toBe('25');
    expect(q('.azan__progress-bar').style.transform).toBe('scaleX(0.25)');
  });

  it('Stop ends the moment and returns to the clock', async () => {
    m = mountApp({ start: new Date(t.maghrib.getTime() - 60_000) });
    await atMaghrib(m);
    expect(q('.azan__stop').textContent).toBe('Durdur');
    q('.azan__stop').click();
    await flush();
    expect(q('.azan').classList.contains('azan--visible')).toBe(false);
    expect(m.app.state().audio.status).toBe('ready');
  });

  it('shows the dua text while the dua plays, then returns to the clock', async () => {
    m = mountApp({
      start: new Date(t.maghrib.getTime() - 60_000),
      settings: {
        azan: { ...defaultSettings.azan, dua: { enabled: true, source: 'bundled:dua' } },
      },
    });
    await atMaghrib(m);
    m.player!.finish();
    await flush();
    m.clock.advanceBy(1000);
    expect(q('.azan__dua').hidden).toBe(false);
    expect(q('.azan__dua-text').textContent).toMatch(/^Allah'ım!/);
    m.player!.finish();
    await flush();
    expect(q('.azan').classList.contains('azan--visible')).toBe(false);
  });
});
